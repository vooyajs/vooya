export const registryPackages = ["compiler", "core", "build-core", "vite", "vue", "react"];

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
  const versions = {};
  for (const shortName of registryPackages) {
    const name = `@vooya/${shortName}`;
    const manifest = snapshot[name];
    if (!manifest || manifest.name !== name || !exactVersion.test(manifest.version ?? "")) {
      throw new Error(`Registry snapshot is missing a valid manifest for ${name}.`);
    }
    if (manifest["dist-tags"]?.[tag] !== manifest.version) {
      throw new Error(`Registry ${name}@${manifest.version} does not match dist-tag ${JSON.stringify(tag)}.`);
    }
    if (!isRegistryUrl(manifest.dist?.tarball)) {
      throw new Error(`Registry ${name} has a non-registry tarball: ${manifest.dist?.tarball ?? "missing"}.`);
    }
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
  const required = new Set(["compiler", "core", "build-core", "vite", framework].map((name) => `@vooya/${name}`));
  for (const [path, entry] of Object.entries(lockfile.packages ?? {})) {
    const match = path.match(/(?:^|\/)node_modules\/(@vooya\/[^/]+)$/);
    if (!match) continue;
    const name = match[1];
    const manifest = snapshot[name];
    if (!manifest || entry.version !== manifest.version) {
      throw new Error(`Registry ${framework} consumer resolved ${name}@${entry.version ?? "missing"} at ${path}, expected snapshot ${manifest?.version ?? "missing"}.`);
    }
    if (entry.link || !isRegistryUrl(entry.resolved) || entry.resolved !== manifest.dist?.tarball) {
      throw new Error(`Registry ${framework} consumer did not lock ${name} to its snapshot npm tarball: ${entry.resolved ?? "missing resolution"}.`);
    }
    required.delete(name);
  }
  if (required.size) {
    throw new Error(`Registry ${framework} consumer is missing snapshot packages: ${[...required].join(", ")}.`);
  }
}

export function parseRegistryArguments(args, env = {}) {
  let expectedRoot = env.VOOYA_REGISTRY_EXPECTED_ROOT;
  let explicitRoot = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument !== "--expected-root" && !argument.startsWith("--expected-root=")) {
      throw new Error(`Unknown registry consumer argument: ${argument}.`);
    }
    const value = argument === "--expected-root" ? args[++index] : argument.slice("--expected-root=".length);
    if (!value || value.startsWith("--") || explicitRoot) {
      throw new Error("--expected-root requires one candidate repository path.");
    }
    expectedRoot = value;
    explicitRoot = true;
  }
  return { expectedRoot };
}
