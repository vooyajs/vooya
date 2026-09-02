import assert from "node:assert/strict";
import test from "node:test";
import { createRustArtifact, validateArtifact } from "../dist/index.js";

test("normalizes Rust output for provider-neutral consumers", () => {
  const artifact = createRustArtifact({ runtimeModule: "/dist/loader.js", wasm: "/dist/component.wasm", abiVersion: 1 });
  assert.equal(artifact.provider, "rust");
  assert.deepEqual(artifact.assets.map((asset) => [asset.kind, asset.loadAs]), [["javascript", "module"], ["wasm", "bytes"]]);
  assert.strictEqual(validateArtifact(artifact), artifact);
});

test("rejects invalid worker assets", () => {
  assert.throws(() => validateArtifact({
    formatVersion: 1,
    provider: "test",
    assets: [
      { path: "/component.wasm", kind: "wasm", required: true, loadAs: "bytes" },
      { path: "/worker.js", kind: "worker", required: true, loadAs: "module" },
    ],
    watchFiles: [],
  }), /Worker assets must use/);
});
