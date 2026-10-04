// @ts-check
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Manifest data remains untrusted at runtime. Optional fields let the verifier
 * diagnose missing registry/lockfile fields instead of treating parsing as proof.
 * @typedef {{name?: string, version?: string, dependencies?: Record<string, unknown>, optionalDependencies?: Record<string, unknown>, peerDependencies?: Record<string, unknown>, "dist-tags"?: Record<string, string>, dist?: {tarball?: string, integrity?: string}, packedPath?: string}} Manifest
 * @typedef {Record<string, Manifest>} Snapshot
 * @typedef {{name: string, version: string}} Candidate
 * @typedef {{version?: string, resolved?: string, integrity?: string, link?: boolean}} LockEntry
 * @typedef {{packages?: Record<string, LockEntry>}} Lockfile
 * @typedef {"dependencies" | "optionalDependencies" | "peerDependencies"} DependencyField
 */
export const registryPackages = ["compiler", "core", "build-core", "vite", "vue", "react"];

// Keep legacy registry roots: the provider is discovered from published dependency
// edges, so historical releases do not require an unpublished package.
export const candidatePackages = [...registryPackages, "provider-rust"];

/** @param {Snapshot} snapshot @param {string} framework */
export function consumerPackages(snapshot, framework) {
  const required = new Set(["compiler", "core", "build-core", "vite", framework].map((name) => `@vooya/${name}`));
  for (const name of required) {
    for (const field of dependencyFields) {
      for (const dependency of Object.keys(internalDependencies(snapshot[name] ?? {}, field))) required.add(dependency);
    }
  }
  return [...required];
}

/** @type {DependencyField[]} */
const dependencyFields = ["dependencies", "optionalDependencies", "peerDependencies"];
const exactVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/** @param {Manifest} manifest @param {DependencyField} field */
function internalDependencies(manifest, field) {
  return Object.fromEntries(Object.entries(manifest[field] ?? {})
    .filter(([name]) => name.startsWith("@vooya/"))
    .sort(([left], [right]) => left.localeCompare(right)));
}

/** @param {unknown} value */
function isRegistryUrl(value) {
  try {
    if (typeof value !== "string") return false;
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "registry.npmjs.org" && !url.username && !url.password && !url.port;
  } catch {
    return false;
  }
}

// A release snapshot may intentionally contain several package versions. Its
// invariant is that each published internal dependency points into this snapshot.
/** @param {Snapshot} snapshot @param {string} tag @param {Snapshot} [expectedManifests] @param {Candidate[]} [candidates] */
export function verifyRegistrySnapshot(snapshot, tag, expectedManifests, candidates) {
  if (candidates && (!expectedManifests || !Array.isArray(candidates) || !candidates.length || new Set(candidates.map((entry) => entry.name)).size !== candidates.length)) throw new Error("Candidate-aware registry verification requires exact manifests and unique candidates.");
  for (const entry of candidates ?? []) if (expectedManifests?.[entry.name] && expectedManifests?.[entry.name].version !== entry.version) throw new Error(`Registry candidate ${entry.name} does not match its expected version.`);
  return verifySnapshot(snapshot, expectedManifests, (manifest, name) => {
    const tagged = !candidates || candidates.some((entry) => entry.name === name);
    if (tagged && !new RegExp(`-${tag}\\.(0|[1-9]\\d*)$`).test(manifest.version ?? "")) {
      throw new Error(`Registry ${name}@${manifest.version} is not a ${tag} release.`);
    }
    if (tagged && manifest["dist-tags"]?.[tag] !== manifest.version) {
      throw new Error(`Registry ${name}@${manifest.version} does not match dist-tag ${JSON.stringify(tag)}.`);
    }
    if (!isRegistryUrl(manifest.dist?.tarball)) {
      throw new Error(`Registry ${name} has a non-registry tarball: ${manifest.dist?.tarball ?? "missing"}.`);
    }
  });
}

/** @param {Snapshot} snapshot @param {Snapshot} expectedManifests */
export function verifyPackedSnapshot(snapshot, expectedManifests) {
  if (!expectedManifests) throw new Error("Packed verification requires expected candidate manifests.");
  return verifySnapshot(snapshot, expectedManifests, (manifest, name) => {
    if (!isAbsolute(manifest.packedPath ?? "") || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(manifest.dist?.integrity ?? "")) {
      throw new Error(`Packed ${name} is missing its tarball path or integrity.`);
    }
  });
}

/** @param {Snapshot} snapshot @param {Snapshot | undefined} expectedManifests @param {(manifest: Manifest, name: string) => void} verifySource */
function verifySnapshot(snapshot, expectedManifests, verifySource) {
  /** @type {Record<string, string>} */
  const versions = {};
  const names = new Set([...registryPackages.map((name) => `@vooya/${name}`), ...Object.keys(snapshot), ...Object.keys(expectedManifests ?? {})]);
  for (const name of names) {
    const shortName = name.replace("@vooya/", "");
    const manifest = snapshot[name];
    if (!manifest || manifest.name !== name || typeof manifest.version !== "string" || !exactVersion.test(manifest.version)) {
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

/** @param {Lockfile} lockfile @param {string} framework @param {Snapshot} snapshot */
export function verifyRegistryLockfile(lockfile, framework, snapshot) {
  return verifyLockfile(lockfile, framework, snapshot, (entry, manifest) =>
    !entry.link && isRegistryUrl(entry.resolved) && entry.resolved === manifest.dist?.tarball
      && (!manifest.dist?.integrity || entry.integrity === manifest.dist?.integrity), "snapshot npm tarball");
}

/** @param {Lockfile} lockfile @param {string} framework @param {Snapshot} snapshot @param {string} projectRoot */
export function verifyPackedLockfile(lockfile, framework, snapshot, projectRoot) {
  return verifyLockfile(lockfile, framework, snapshot, (entry, manifest) => {
    if (entry.link || typeof entry.resolved !== "string" || !entry.resolved.startsWith("file:")) return false;
    let path;
    try {
      path = entry.resolved.startsWith("file://") ? fileURLToPath(entry.resolved) : resolve(projectRoot, entry.resolved.slice(5));
    } catch { return false; }
    const integrity = manifest.dist?.integrity;
    return path === manifest.packedPath && typeof integrity === "string" && integrity.length > 0 && entry.integrity === integrity;
  }, "candidate tarball and integrity");
}

/** @param {Lockfile} lockfile @param {string} framework @param {Snapshot} snapshot @param {(entry: LockEntry, manifest: Manifest) => boolean} verifySource @param {string} description */
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

/** @param {string[]} args @param {Record<string, string | undefined>} [env] */
export function parseRegistryArguments(args, env = {}) {
  /** @type {{expectedRoot?: string, packDir?: string, tag: string}} */
  const result = {
    expectedRoot: env.VOOYA_REGISTRY_EXPECTED_ROOT,
    packDir: undefined,
    tag: env.VOOYA_REGISTRY_TAG ?? "alpha",
  };
  /** @type {Record<string, "expectedRoot" | "packDir" | "tag">} */
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
