import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

import { generatedCargoManifest, remapRustDiagnostic, resolveRustDependencyRoots, resolveRuntimeCrateRoot } from "../dist/index.js";

test("exposes a bundler-neutral runtime and dependency watch roots", () => {
  assert.equal(existsSync(`${resolveRuntimeCrateRoot()}/Cargo.toml`), true);
  assert.deepEqual(resolveRustDependencyRoots({ dependencies: { shared: { path: "rust/shared" } } }, "/consumer"), ["/consumer/rust/shared"]);
});

test("build manifest keeps compiler-managed dependencies pinned", () => {
  const manifest = generatedCargoManifest({ applicationRoot: "/consumer", runtimeCrateRoot: "/runtime", rust: { dependencies: { serde: { version: "1", features: ["derive"] } } } });
  assert.match(manifest, /vooya-core = \{ path = "\/runtime" \}/);
  assert.match(manifest, /wasm-bindgen = "=0\.2\.115"/);
  assert.match(manifest, /"serde" = \{ version = "1", features = \["derive"\] \}/);
  assert.throws(() => generatedCargoManifest({ applicationRoot: "/consumer", runtimeCrateRoot: "/runtime", rust: { dependencies: { "web-sys": "1" } } }), /managed by Vooya/);
});

test("maps Cargo diagnostics using compiler source location metadata", () => {
  const generated = "/project/cache/src/components/0-Counter.rs";
  const diagnostic = remapRustDiagnostic({ level: "error", message: "missing", rendered: `error\n --> ${generated}:4:9\n  |\n4 | missing\n`, spans: [{ file_name: generated, line_start: 4, column_start: 9 }] }, new Map([[generated, { id: "/project/src/Counter.voo", startLine: 10, generatedLineOffset: 1 }]]));
  assert.match(diagnostic, /\/project\/src\/Counter\.voo:12:9/);
  assert.match(diagnostic, /12 \| missing/);
});
