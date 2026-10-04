import assert from "node:assert/strict";
import test from "node:test";
import * as legacy from "../dist/index.js";
import * as rust from "@vooya/provider-rust";

test("the compatibility entry shares the Rust API, errors and toolchain cache", () => {
  assert.deepEqual(Object.keys(legacy), Object.keys(rust));
  for (const name of Object.keys(rust)) {
    assert.equal(legacy[name], rust[name], `${name} must retain its identity across entry points`);
  }

  const error = new rust.CargoBuildError("build failed", {
    cargoPath: "/tools/cargo", rustcPath: "/tools/rustc", exitCode: 101,
  });
  assert.ok(error instanceof legacy.CargoBuildError);
  assert.ok(error instanceof legacy.VooyaUserError);
  assert.equal(legacy.isVooyaUserError(error), true);
  assert.equal(legacy.resolveToolchain, rust.resolveToolchain);
  assert.equal(legacy.clearToolchainCache, rust.clearToolchainCache);
});

test("legacy callers can build without a new provider option", () => {
  assert.throws(() => legacy.buildApplication({ applicationRoot: "" }), /requires applicationRoot/);
  assert.equal(legacy.WASM_BINDGEN_VERSION, rust.WASM_BINDGEN_VERSION);
  assert.equal(legacy.resolveRuntimeCrateRoot(), rust.resolveRuntimeCrateRoot());
  assert.deepEqual(legacy.resolveVooyaWorkspace("/consumer"), rust.resolveVooyaWorkspace("/consumer"));
});
