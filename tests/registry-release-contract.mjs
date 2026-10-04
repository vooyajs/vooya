import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { parseRegistryArguments, registryPackages, verifyPackedLockfile, verifyPackedSnapshot, verifyRegistryLockfile, verifyRegistrySnapshot } from "./helpers/registry-release-contract.mjs";

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
  assert.deepEqual(parseRegistryArguments([]), { expectedRoot: undefined, packDir: undefined, tag: "alpha" });
  assert.deepEqual(parseRegistryArguments([], { VOOYA_REGISTRY_EXPECTED_ROOT: "/candidate" }), { expectedRoot: "/candidate", packDir: undefined, tag: "alpha" });
  assert.deepEqual(parseRegistryArguments(["--expected-root", "/chosen"], { VOOYA_REGISTRY_EXPECTED_ROOT: "/candidate" }), { expectedRoot: "/chosen", packDir: undefined, tag: "alpha" });
  assert.deepEqual(parseRegistryArguments(["--expected-root=/chosen"]), { expectedRoot: "/chosen", packDir: undefined, tag: "alpha" });
  for (const args of [["--expected-root"], ["--expected-root="], ["--local"], ["--expected-root=a", "--expected-root=b"]]) {
    assert.throws(() => parseRegistryArguments(args));
  }
});

function betaRelease() {
  return JSON.parse(JSON.stringify(release()).replaceAll("0.1.0-alpha.12", "0.1.0-beta.0").replaceAll("0.1.0-alpha.13", "0.1.0-beta.0").replaceAll('"alpha":', '"beta":'));
}

test("beta verification compares exact candidate versions and dependency pins, not just the channel spelling", () => {
  const snapshot = betaRelease();
  const expected = structuredClone(snapshot);
  verifyRegistrySnapshot(snapshot, "beta", expected);
  const mistaggedAlpha = release();
  for (const manifest of Object.values(mistaggedAlpha)) manifest["dist-tags"].beta = manifest.version;
  assert.throws(() => verifyRegistrySnapshot(mistaggedAlpha, "beta", mistaggedAlpha), /not a beta/);
  for (const framework of ["vue", "react"]) verifyRegistryLockfile(consumer(snapshot, framework), framework, snapshot);
  const wrong = structuredClone(snapshot);
  wrong["@vooya/vue"].version = "0.1.0-beta.1";
  wrong["@vooya/vue"]["dist-tags"].beta = "0.1.0-beta.1";
  assert.throws(() => verifyRegistrySnapshot(wrong, "beta", expected), /expected candidate/);
  snapshot["@vooya/vite"].dependencies["@vooya/core"] = "0.1.0-beta.1";
  assert.throws(() => verifyRegistrySnapshot(snapshot, "beta", expected), /must pin the snapshot version exactly/);
});

function packedRelease() {
  const snapshot = betaRelease();
  for (const manifest of Object.values(snapshot)) {
    delete manifest["dist-tags"];
    manifest.packedPath = resolve("candidate", `${manifest.name.slice(7)}.tgz`);
    manifest.dist = { integrity: `sha512-${Buffer.alloc(64, 1).toString("base64")}` };
  }
  return snapshot;
}

function packedConsumer(snapshot) {
  return { lockfileVersion: 3, packages: Object.fromEntries(["compiler", "core", "build-core", "vite", "vue"].map((name) => {
    const manifest = snapshot[`@vooya/${name}`];
    return [`node_modules/${manifest.name}`, { version: manifest.version, resolved: `file:../candidate/${name}.tgz`, integrity: manifest.dist.integrity }];
  })) };
}

test("packed candidate manifests and lockfile must match exact versions, archive paths and bytes", () => {
  const snapshot = packedRelease();
  verifyPackedSnapshot(snapshot, betaRelease());
  verifyPackedLockfile(packedConsumer(snapshot), "vue", snapshot, resolve("consumer"));
  assert.throws(() => verifyPackedSnapshot(snapshot), /requires expected candidate/);
  for (const patch of [
    { resolved: "https://registry.npmjs.org/@vooya/core/-/core-0.1.0-beta.0.tgz" },
    { resolved: "file:../other/core.tgz" },
    { integrity: `sha512-${Buffer.alloc(64, 2).toString("base64")}` },
    { link: true },
  ]) {
    const lock = packedConsumer(snapshot);
    Object.assign(lock.packages["node_modules/@vooya/core"], patch);
    assert.throws(() => verifyPackedLockfile(lock, "vue", snapshot, resolve("consumer")), /candidate tarball and integrity/);
  }
  const wrongVersion = packedRelease();
  wrongVersion["@vooya/vue"].version = "0.1.0-beta.1";
  assert.throws(() => verifyPackedSnapshot(wrongVersion, betaRelease()), /expected candidate/);
  const missing = packedRelease();
  delete missing["@vooya/build-core"];
  assert.throws(() => verifyPackedSnapshot(missing, betaRelease()), /valid manifest|snapshot missing/);
});

test("candidate source modes cannot weaken registry-only provenance", () => {
  const snapshot = packedRelease();
  for (const manifest of Object.values(snapshot)) manifest["dist-tags"] = { beta: manifest.version };
  assert.throws(() => verifyRegistrySnapshot(snapshot, "beta", betaRelease()), /non-registry tarball/);
  const packed = packedRelease();
  const lock = packedConsumer(packed);
  lock.packages["node_modules/@vooya/vite/node_modules/@vooya/core"] = {
    version: packed["@vooya/core"].version,
    resolved: "https://registry.npmjs.org/@vooya/core/-/core-0.1.0-beta.0.tgz",
  };
  assert.throws(() => verifyPackedLockfile(lock, "vue", packed, resolve("consumer")), /candidate tarball and integrity/);
});

test("beta and packed commands require an explicit exact candidate source", () => {
  assert.deepEqual(parseRegistryArguments(["--tag", "beta", "--expected-root", "/candidate"]), { tag: "beta", expectedRoot: "/candidate", packDir: undefined });
  assert.deepEqual(parseRegistryArguments(["--pack-dir=/packed", "--expected-root=/candidate"]), { tag: "alpha", expectedRoot: "/candidate", packDir: "/packed" });
  for (const args of [["--tag", "beta"], ["--pack-dir", "/packed"], ["--tag", "latest"], ["--tag", "alpha", "--tag", "beta"]]) assert.throws(() => parseRegistryArguments(args));
  assert.throws(() => parseRegistryArguments([], { VOOYA_REGISTRY_TAG: "beta" }), /expected-root/);
});

function withProvider(snapshot) {
  const core = snapshot["@vooya/core"];
  const name = "@vooya/provider-rust";
  snapshot[name] = { ...core, name, dependencies: { "@vooya/core": core.version, "@vooya/compiler": snapshot["@vooya/compiler"].version } };
  snapshot["@vooya/build-core"].dependencies = { [name]: core.version };
  return snapshot;
}

test("new provider dependency is checked without requiring it in historical releases", () => {
  const snapshot = withProvider(release());
  verifyRegistrySnapshot(snapshot, "alpha");
  const lock = consumer(snapshot);
  assert.throws(() => verifyRegistryLockfile(lock, "vue", snapshot), /missing snapshot packages: @vooya\/provider-rust/);
  const provider = snapshot["@vooya/provider-rust"];
  lock.packages["node_modules/@vooya/provider-rust"] = { version: provider.version, resolved: provider.dist.tarball };
  verifyRegistryLockfile(lock, "vue", snapshot);
  provider["dist-tags"] = { alpha: "0.0.0" };
  assert.throws(() => verifyRegistrySnapshot(snapshot, "alpha"), /does not match dist-tag/);
  delete snapshot["@vooya/provider-rust"];
  assert.throws(() => verifyRegistrySnapshot(snapshot, "alpha"), /snapshot version exactly/);
});

test("packed provider must preserve candidate archive provenance and dependency versions", () => {
  const expected = withProvider(betaRelease());
  const snapshot = withProvider(packedRelease());
  const provider = snapshot["@vooya/provider-rust"];
  provider.packedPath = resolve("candidate/provider-rust.tgz");
  verifyPackedSnapshot(snapshot, expected);
  const lock = packedConsumer(snapshot);
  assert.throws(() => verifyPackedLockfile(lock, "vue", snapshot, resolve("consumer")), /missing snapshot packages/);
  lock.packages["node_modules/@vooya/provider-rust"] = { version: provider.version, resolved: "file:../candidate/provider-rust.tgz", integrity: provider.dist.integrity };
  verifyPackedLockfile(lock, "vue", snapshot, resolve("consumer"));
  lock.packages["node_modules/@vooya/provider-rust"].integrity = "wrong";
  assert.throws(() => verifyPackedLockfile(lock, "vue", snapshot, resolve("consumer")), /candidate tarball and integrity/);
  provider.dependencies = { "@vooya/core": "0.0.0" };
  assert.throws(() => verifyPackedSnapshot(snapshot, expected), /snapshot version exactly/);
});


test("a newly introduced provider can use an independent beta version", () => {
  const snapshot = withProvider(betaRelease());
  const provider = snapshot["@vooya/provider-rust"];
  provider.version = "0.0.1-beta.0";
  provider["dist-tags"] = { beta: provider.version };
  provider.dist = { tarball: "https://registry.npmjs.org/@vooya/provider-rust/-/provider-rust-0.0.1-beta.0.tgz" };
  snapshot["@vooya/build-core"].dependencies[provider.name] = provider.version;
  verifyRegistrySnapshot(snapshot, "beta", structuredClone(snapshot));
});


test("alpha candidates can consume unchanged beta packages without moving their tags", () => {
  const snapshot = betaRelease();
  const expected = structuredClone(snapshot);
  const candidates = [{ name: "@vooya/vite", version: "0.2.0-alpha.0" }];
  for (const graph of [snapshot, expected]) {
    graph["@vooya/vite"].version = "0.2.0-alpha.0";
    graph["@vooya/vite"]["dist-tags"].alpha = "0.2.0-alpha.0";
  }
  verifyRegistrySnapshot(snapshot, "alpha", expected, candidates);
  assert.throws(() => verifyRegistrySnapshot(snapshot, "alpha", expected), /not a alpha release/);
  const wrong = structuredClone(snapshot);
  wrong["@vooya/vite"]["dist-tags"].alpha = "0.2.0-alpha.1";
  assert.throws(() => verifyRegistrySnapshot(wrong, "alpha", expected, candidates), /does not match dist-tag/);
  wrong["@vooya/core"].version = "0.1.0-beta.1";
  assert.throws(() => verifyRegistrySnapshot(wrong, "alpha", expected, candidates), /expected candidate|snapshot version exactly/);
  assert.throws(() => verifyRegistrySnapshot(snapshot, "alpha", undefined, candidates), /requires exact manifests/);
});

test("packed lock verification rejects missing integrity even when both sides omit it", () => {
  for (const dist of [undefined, {}, { integrity: "" }]) {
    const snapshot = packedRelease();
    const lock = packedConsumer(snapshot);
    snapshot["@vooya/core"].dist = dist;
    delete lock.packages["node_modules/@vooya/core"].integrity;
    assert.throws(() => verifyPackedLockfile(lock, "vue", snapshot, resolve("consumer")), /candidate tarball and integrity/);
  }
});
