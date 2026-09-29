import assert from "node:assert/strict";
import test from "node:test";
import { parseRegistryArguments, registryPackages, verifyRegistryLockfile, verifyRegistrySnapshot } from "./helpers/registry-release-contract.mjs";

function release() {
  const snapshot = Object.fromEntries(registryPackages.map((shortName) => {
    const name = `@vooya/${shortName}`;
    const version = ["build-core", "vite"].includes(shortName) ? "0.1.0-alpha.13" : "0.1.0-alpha.12";
    return [name, { name, version, "dist-tags": { alpha: version }, dist: { tarball: `https://registry.npmjs.org/${name}/-/${shortName}-${version}.tgz` } }];
  }));
  snapshot["@vooya/build-core"].dependencies = { "@vooya/compiler": "0.1.0-alpha.12", "@vooya/core": "0.1.0-alpha.12", "smol-toml": "1.8.0" };
  snapshot["@vooya/vite"].dependencies = { "@vooya/build-core": "0.1.0-alpha.13", "@vooya/compiler": "0.1.0-alpha.12", "@vooya/core": "0.1.0-alpha.12" };
  return snapshot;
}

function consumer(snapshot, framework = "vue") {
  return { lockfileVersion: 3, packages: Object.fromEntries(["compiler", "core", "build-core", "vite", framework].map((shortName) => {
    const manifest = snapshot[`@vooya/${shortName}`];
    return [`node_modules/${manifest.name}`, { version: manifest.version, resolved: manifest.dist.tarball }];
  })) };
}

test("independent alpha.12/alpha.13 packages form a valid registry release for both consumers", () => {
  const snapshot = release();
  const versions = verifyRegistrySnapshot(snapshot, "alpha");
  assert.equal(versions.vite, "0.1.0-alpha.13");
  assert.equal(versions.vue, "0.1.0-alpha.12");
  for (const framework of ["vue", "react"]) verifyRegistryLockfile(consumer(snapshot, framework), framework, snapshot);
});

test("a stale tag or missing package cannot satisfy a release snapshot", () => {
  const stale = release();
  stale["@vooya/build-core"]["dist-tags"].alpha = "0.1.0-alpha.12";
  assert.throws(() => verifyRegistrySnapshot(stale, "alpha"), /does not match dist-tag/);
  const missing = release();
  delete missing["@vooya/react"];
  assert.throws(() => verifyRegistrySnapshot(missing, "alpha"), /valid manifest for @vooya\/react/);
});

test("internal dependency pins must target this snapshot, not older versions, ranges or local packages", () => {
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
    for (const version of ["0.1.0-alpha.11", "^0.1.0-alpha.12", "file:../core", "workspace:*", "npm:@vooya/core@0.1.0-alpha.12"]) {
      const snapshot = release();
      snapshot["@vooya/vite"][field] = { "@vooya/core": version };
      assert.throws(() => verifyRegistrySnapshot(snapshot, "alpha"), /must pin the snapshot version exactly/);
    }
  }
  const snapshot = release();
  snapshot["@vooya/vite"].dependencies["@vooya/unknown"] = "0.1.0-alpha.12";
  assert.throws(() => verifyRegistrySnapshot(snapshot, "alpha"), /snapshot missing/);
});

test("registry manifest identity and tarball provenance are checked", () => {
  const wrongName = release();
  wrongName["@vooya/core"].name = "some-other-package";
  assert.throws(() => verifyRegistrySnapshot(wrongName, "alpha"), /valid manifest/);
  for (const tarball of ["file:../core.tgz", "https://registry.npmjs.org.evil.example/core.tgz", "http://registry.npmjs.org/core.tgz"]) {
    const snapshot = release();
    snapshot["@vooya/core"].dist.tarball = tarball;
    assert.throws(() => verifyRegistrySnapshot(snapshot, "alpha"), /non-registry tarball/);
  }
});

test("a consumer missing build-core fails even if all formerly checked packages exist", () => {
  const snapshot = release();
  const lock = consumer(snapshot);
  delete lock.packages["node_modules/@vooya/build-core"];
  assert.throws(() => verifyRegistryLockfile(lock, "vue", snapshot), /missing snapshot packages: @vooya\/build-core/);
});

test("lock provenance rejects local files, links and substituted registry tarballs", () => {
  const snapshot = release();
  for (const patch of [{ resolved: "file:../build-core" }, { link: true }, { resolved: "https://registry.npmjs.org/@vooya/build-core/-/build-core-0.1.0-alpha.11.tgz" }]) {
    const lock = consumer(snapshot);
    Object.assign(lock.packages["node_modules/@vooya/build-core"], patch);
    assert.throws(() => verifyRegistryLockfile(lock, "vue", snapshot), /snapshot npm tarball/);
  }
});

test("nested Vooya packages cannot hide stale or local dependencies behind valid top-level packages", () => {
  const snapshot = release();
  const lock = consumer(snapshot);
  const nested = "node_modules/@vooya/vite/node_modules/@vooya/core";
  lock.packages[nested] = { ...lock.packages["node_modules/@vooya/core"], version: "0.1.0-alpha.11" };
  assert.throws(() => verifyRegistryLockfile(lock, "vue", snapshot), /expected snapshot 0.1.0-alpha.12/);
  lock.packages[nested] = { ...lock.packages["node_modules/@vooya/core"], resolved: "file:../../core" };
  assert.throws(() => verifyRegistryLockfile(lock, "vue", snapshot), /snapshot npm tarball/);
});

test("candidate comparison is opt-in and compares per-package versions and internal dependency sets", () => {
  const snapshot = release();
  const candidate = structuredClone(snapshot);
  verifyRegistrySnapshot(snapshot, "alpha", candidate);
  candidate["@vooya/vite"].version = "0.1.0-alpha.14";
  verifyRegistrySnapshot(snapshot, "alpha");
  assert.throws(() => verifyRegistrySnapshot(snapshot, "alpha", candidate), /expected candidate/);
  candidate["@vooya/vite"].version = snapshot["@vooya/vite"].version;
  delete candidate["@vooya/vite"].dependencies["@vooya/core"];
  assert.throws(() => verifyRegistrySnapshot(snapshot, "alpha", candidate), /internal dependencies/);
});

test("expected-root defaults to registry-only and allows an explicit CLI override of the environment", () => {
  assert.deepEqual(parseRegistryArguments([]), { expectedRoot: undefined });
  assert.deepEqual(parseRegistryArguments([], { VOOYA_REGISTRY_EXPECTED_ROOT: "/candidate" }), { expectedRoot: "/candidate" });
  assert.deepEqual(parseRegistryArguments(["--expected-root", "/chosen"], { VOOYA_REGISTRY_EXPECTED_ROOT: "/candidate" }), { expectedRoot: "/chosen" });
  assert.deepEqual(parseRegistryArguments(["--expected-root=/chosen"]), { expectedRoot: "/chosen" });
  for (const args of [["--expected-root"], ["--expected-root="], ["--local"], ["--expected-root=a", "--expected-root=b"]]) {
    assert.throws(() => parseRegistryArguments(args));
  }
});
