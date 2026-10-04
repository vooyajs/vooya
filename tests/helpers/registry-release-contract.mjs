import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const registryPackages = ["compiler", "core", "build-core", "vite", "vue", "react"];

// Keep legacy registry roots: the provider is discovered from published dependency
// edges, so historical releases do not require an unpublished package.
export const candidatePackages = [...registryPackages, "provider-rust"];

export function consumerPackages(snapshot, framework) {
  const required = new Set(["compiler", "core", "build-core", "vite", framework].map((name) => `@vooya/${name}`));
  for (const name of required) {
    for (const field of dependencyFields) {
      for (const dependency of Object.keys(internalDependencies(snapshot[name] ?? {}, field))) required.add(dependency);
    }
  }
  return [...required];
}

const dependencyFields = ["dependencies", "optionalDependencies", "peerDependencies"];
const exactVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function internalDependencies(manifest, field) {
  return Object.fromEntries(Object.entries(manifest[field] ?? {})
    .filter(([name]) => name.startsWith("@vooya/"))
    .sort(([left], [right]) => left.localeCompare(right)));
}

function isRegistryUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "registry.npmjs.org" && !url.username && !url.password && !url.port;
  } catch {
    return false;
  }
}

// A release snapshot may intentionally contain several package versions. Its
// invariant is that each published internal dependency points into this snapshot.
export function verifyRegistrySnapshot(snapshot, tag, expectedManifests) {
  return verifySnapshot(snapshot, expectedManifests, (manifest, name) => {
    if (tag === "beta" && !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-beta\.(0|[1-9]\d*)$/.test(manifest.version)) {
      throw new Error(`Registry ${name}@${manifest.version} is not a beta release.`);
    }
    if (manifest["dist-tags"]?.[tag] !== manifest.version) {
      throw new Error(`Registry ${name}@${manifest.version} does not match dist-tag ${JSON.stringify(tag)}.`);
    }
    if (!isRegistryUrl(manifest.dist?.tarball)) {
      throw new Error(`Registry ${name} has a non-registry tarball: ${manifest.dist?.tarball ?? "missing"}.`);
    }
  });
}

export function verifyPackedSnapshot(snapshot, expectedManifests) {
  if (!expectedManifests) throw new Error("Packed verification requires expected candidate manifests.");
  return verifySnapshot(snapshot, expectedManifests, (manifest, name) => {
    if (!isAbsolute(manifest.packedPath ?? "") || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(manifest.dist?.integrity ?? "")) {
      throw new Error(`Packed ${name} is missing its tarball path or integrity.`);
    }
  });
}

function verifySnapshot(snapshot, expectedManifests, verifySource) {
  const versions = {};
  const names = new Set([...registryPackages.map((name) => `@vooya/${name}`), ...Object.keys(snapshot), ...Object.keys(expectedManifests ?? {})]);
  for (const name of names) {
    const shortName = name.replace("@vooya/", "");
    const manifest = snapshot[name];
    if (!manifest || manifest.name !== name || !exactVersion.test(manifest.version ?? "")) {
      throw new Error(`Registry snapshot is missing a valid manifest for ${name}.`);
    }
    verifySource(manifest, name);
    versions[shortName] = manifest.version;
    for (const field of dependencyFields) {
      for (const [dependency, version] of Object.entries(internalDependencies(manifest, field))) {
        if (typeof version !== "string" || !exactVersion.test(version) || snapshot[dependency]?.version !== version) {
          throw new Error(`Registry ${name} ${field}.${dependency} must pin the snapshot version exactly; received ${JSON.stringify(version)}, snapshot ${snapshot[dependency]?.version ?? "missing"}.`);
        }
      }
    }
    if (expectedManifests) {
      const expected = expectedManifests[name];
      if (expected?.name !== name || expected.version !== manifest.version) {
        throw new Error(`Registry ${name}@${manifest.version} does not match the expected candidate ${expected?.version ?? "missing"}.`);
      }
      for (const field of dependencyFields) {
        if (JSON.stringify(internalDependencies(expected, field)) !== JSON.stringify(internalDependencies(manifest, field))) {
          throw new Error(`Registry ${name} ${field} differs from the expected candidate's internal dependencies.`);
        }
      }
    }
  }
  return versions;
}

export function verifyRegistryLockfile(lockfile, framework, snapshot) {
  return verifyLockfile(lockfile, framework, snapshot, (entry, manifest) =>
    !entry.link && isRegistryUrl(entry.resolved) && entry.resolved === manifest.dist?.tarball
      && (!manifest.dist.integrity || entry.integrity === manifest.dist.integrity), "snapshot npm tarball");
}

export function verifyPackedLockfile(lockfile, framework, snapshot, projectRoot) {
  return verifyLockfile(lockfile, framework, snapshot, (entry, manifest) => {
    if (entry.link || typeof entry.resolved !== "string" || !entry.resolved.startsWith("file:")) return false;
    let path;
    try {
      path = entry.resolved.startsWith("file://") ? fileURLToPath(entry.resolved) : resolve(projectRoot, entry.resolved.slice(5));
    } catch { return false; }
    return path === manifest.packedPath && entry.integrity === manifest.dist.integrity;
  }, "candidate tarball and integrity");
}

function verifyLockfile(lockfile, framework, snapshot, verifySource, description) {
  const required = new Set(consumerPackages(snapshot, framework));
  for (const [path, entry] of Object.entries(lockfile.packages ?? {})) {
    const match = path.match(/(?:^|\/)node_modules\/(@vooya\/[^/]+)$/);
    if (!match) continue;
    const name = match[1];
    const manifest = snapshot[name];
    if (!manifest || entry.version !== manifest.version) {
      throw new Error(`Registry ${framework} consumer resolved ${name}@${entry.version ?? "missing"} at ${path}, expected snapshot ${manifest?.version ?? "missing"}.`);
    }
    if (!verifySource(entry, manifest)) {
      throw new Error(`Registry ${framework} consumer did not lock ${name} to its ${description}: ${entry.resolved ?? "missing resolution"}.`);
    }
    required.delete(name);
  }
  if (required.size) {
    throw new Error(`Registry ${framework} consumer is missing snapshot packages: ${[...required].join(", ")}.`);
  }
}

export function parseRegistryArguments(args, env = {}) {
  const result = {
    expectedRoot: env.VOOYA_REGISTRY_EXPECTED_ROOT,
    packDir: undefined,
    tag: env.VOOYA_REGISTRY_TAG ?? "alpha",
  };
  const names = { "--expected-root": "expectedRoot", "--pack-dir": "packDir", "--tag": "tag" };
  const seen = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const separator = argument.indexOf("=");
    const name = separator < 0 ? argument : argument.slice(0, separator);
    if (!Object.hasOwn(names, name)) throw new Error(`Unknown registry consumer argument: ${argument}.`);
    const value = separator < 0 ? args[++index] : argument.slice(separator + 1);
    if (!value || value.startsWith("--") || seen.has(name)) throw new Error(`${name} requires one value.`);
    result[names[name]] = value;
    seen.add(name);
  }
  if (!["alpha", "beta"].includes(result.tag)) throw new Error("Registry consumer --tag must be alpha or beta.");
  if ((result.packDir || result.tag === "beta") && !result.expectedRoot) {
    throw new Error("Packed and beta verification require --expected-root for exact candidate comparison.");
  }
  return result;
}
