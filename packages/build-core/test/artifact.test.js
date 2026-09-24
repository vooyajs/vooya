import assert from "node:assert/strict";
import test from "node:test";

import { assertArtifact, createRustArtifact } from "../dist/index.js";

test("normalizes Rust output into a provider-neutral artifact", () => {
  const artifact = createRustArtifact({
    runtimeModule: "/build/vooya_app.js",
    wasm: "/build/vooya_app_bg.wasm",
    watchedFiles: ["/app/src/Counter.rs"],
  });

  assert.equal(artifact.provider, "rust");
  assert.equal(artifact.loader, "/build/vooya_app.js");
  assert.deepEqual(artifact.assets.map(({ kind }) => kind), ["javascript", "wasm"]);
  assert.deepEqual(artifact.watchFiles, ["/app/src/Counter.rs"]);
  assert.strictEqual(assertArtifact(artifact), artifact);
});

test("rejects artifacts without a required WASM asset", () => {
  assert.throws(
    () => assertArtifact({ formatVersion: 1, provider: "test", assets: [], watchFiles: [] }),
    /require a WASM asset/,
  );
});

test("rejects malformed artifact assets", () => {
  assert.throws(
    () => assertArtifact({
      formatVersion: 1,
      provider: "test",
      assets: [{ path: "", kind: "wasm", required: true }],
      watchFiles: [],
    }),
    /require path, kind, and required/,
  );
});
