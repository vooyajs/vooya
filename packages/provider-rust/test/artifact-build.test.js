import assert from "node:assert/strict";
import test from "node:test";
import { basename, dirname, resolve } from "node:path";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRustArtifactBuilder, planRustArtifacts } from "../dist/artifact-build.js";
import { buildApplication } from "../dist/index.js";

const root = resolve("artifact-planner-fixture");
const options = (artifacts, defaults = {}) => ({ applicationRoot: root, rust: { ...defaults, artifacts } });
test("separate artifact plans own distinct workspaces and dependency sets", () => {
  const units = planRustArtifacts(options({ heavy: { sourceRoot: "src/heavy", dependencies: { bevy_ecs: "=0.18.1" } }, light: { sourceRoot: "src/light" } }));
  assert.deepEqual(units.map(unit => unit.id), ["heavy", "light"]);
  assert.equal(units[0].rust.dependencies.bevy_ecs, "=0.18.1");
  assert.equal(units[1].rust.dependencies.bevy_ecs, undefined);
  assert.equal(units[0].workspaceRoot, resolve(root, ".vooya/artifacts/heavy"));
  assert.notEqual(units[0].workspaceRoot, units[1].workspaceRoot);
});
test("artifact ownership rejects ambiguous roots and escaped source inputs", () => {
  for (const artifacts of [
    {}, [], "invalid", { a: { sourceRoot: 42 } }, { a: null }, { "../escape": { sourceRoot: "src/a" } },
    { a: { sourceRoot: "src" }, b: { sourceRoot: "src/nested" } },
    { a: { sourceRoot: "../outside" } }, { a: { sourceRoot: ".vooya/a" } },
    { a: { sourceRoot: "." } }, { a: { sourceRoot: "src/a", files: ["src/b/Foreign.rs"] } },
    { a: { sourceRoot: "src/a", entry: "src/b/lib.rs" } },
    { a: { sourceRoot: "src/a", artifacts: {} } },
  ]) assert.throws(() => planRustArtifacts(options(artifacts)), error => error.kind === "artifact-config");
});
test("source configuration belongs to units while common dependencies remain explicit", () => {
  assert.throws(() => planRustArtifacts(options({ a: { sourceRoot: "src/a" } }, { sourceRoot: "src" })), /inside each artifact/);
  const [unit] = planRustArtifacts(options({ a: { sourceRoot: "src/a", dependencies: { shared: "2" } } }, { dependencies: { shared: "1", common: "1" } }));
  assert.deepEqual(unit.rust.dependencies, { shared: "2", common: "1" });
});
test("single-artifact consumers cannot silently ignore a multi-artifact config", () => {
  assert.throws(() => buildApplication(options({ a: { sourceRoot: "src/a" } })), /require createRustArtifactBuilder/);
});


test("artifact sessions rebuild shared dependencies and retry all dirty units after a failure", () => {
  const applicationRoot = mkdtempSync(resolve(tmpdir(), "vooya-artifact-session-"));
  const calls = [];
  let fail;
  let revision = "initial";
  const toolchain = {
    environment: {},
    cargo: { path: "/selected/cargo", version: "cargo 1.94.0" },
    rustc: { path: "/selected/rustc", version: "rustc 1.94.0", verboseVersion: "rustc 1.94.0", sysroot: "/selected" },
    target: { triple: "wasm32-unknown-unknown", libdir: "/selected/wasm" },
    wasmBindgen: { path: "/selected/wasm-bindgen", version: "0.2.115" },
  };
  try {
    for (const id of ["a", "b"]) {
      mkdirSync(resolve(applicationRoot, "src", id), { recursive: true });
      writeFileSync(resolve(applicationRoot, "src", id, "Store.rs"), "pub struct Store;");
    }
    const manifest = resolve(applicationRoot, "Cargo.toml");
    writeFileSync(manifest, '[dependencies]\nshared = { path = "shared" }\n');
    const builder = createRustArtifactBuilder({
      applicationRoot, runtimeCrateRoot: "/runtime", toolchain,
      rust: { artifacts: { a: { sourceRoot: "src/a" }, b: { sourceRoot: "src/b" } } },
      spawn(_command, args) {
        const id = basename(dirname(dirname(args[args.indexOf("--manifest-path") + 1])));
        calls.push(id);
        return { status: id === fail ? 101 : 0, stdout: "", stderr: "" };
      },
      exec(_command, args) {
        const output = args[args.indexOf("--out-dir") + 1];
        writeFileSync(resolve(output, "vooya_app.js"), revision);
        writeFileSync(resolve(output, "vooya_app_bg.wasm"), revision);
      },
    });
    const initial = builder.build();
    assert.deepEqual(calls.splice(0), ["a", "b"]);
    assert.ok(builder.watchedFiles().includes(manifest));
    assert.ok(builder.watchedFiles().includes(resolve(applicationRoot, "shared")));
    builder.build([resolve(applicationRoot, ".vooya/artifacts/a/wasm/vooya_app.js")]);
    assert.deepEqual(calls.splice(0), [], "generated output must not rebuild its inputs");
    const changed = builder.build([resolve(applicationRoot, "src/a/Store.rs")]);
    assert.deepEqual(calls.splice(0), ["a"]);
    assert.equal(changed[1], initial[1], "unaffected artifact should retain its cached result");
    fail = "a";
    revision = "updated";
    assert.throws(() => builder.build([resolve(applicationRoot, "shared/src/lib.rs")]), /Cargo build failed/);
    assert.deepEqual(calls.splice(0), ["a"]);
    for (const artifact of initial) assert.equal(readFileSync(artifact.result.wasm.path, "utf8"), "initial");
    fail = undefined;
    // The new edit only touches a; b still needs the failed shared-dependency update.
    const recovered = builder.build([resolve(applicationRoot, "src/a/Store.rs")]);
    assert.deepEqual(calls.splice(0), ["a", "b"]);
    for (const artifact of recovered) assert.equal(readFileSync(artifact.result.wasm.path, "utf8"), "updated");
    builder.build([manifest]);
    assert.deepEqual(calls.splice(0), ["a", "b"]);
  } finally {
    rmSync(applicationRoot, { recursive: true, force: true });
  }
});
