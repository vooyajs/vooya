import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import { discoverRustSourceFiles, generateRustCrateRoot, generatedCargoManifest, remapRustDiagnostic, resolveRustDependencyRoots, resolveRuntimeCrateRoot, resolveVooyaCrateRoot, rustModuleIdentifier, selectRustRootModules } from "../dist/index.js";

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

test("generates deterministic Rust module declarations", () => {
  assert.equal(rustModuleIdentifier("widgets/cart-item.rs"), "cart_item");
  const root = generateRustCrateRoot(["rust/z.rs", "rust/a.rs", "rust/a.test.rs"], ["rust/a.rs"]);
  assert.match(root, /#\[path = "rust\/a\.rs"\] pub mod a;/);
  assert.match(root, /#\[path = "rust\/a\.test\.rs"\] mod a_test;/);
  assert.match(root, /#\[path = "rust\/z\.rs"\] mod z;/);
  assert.deepEqual(
    selectRustRootModules(["rust/src/domain/cart.rs", "rust/src/domain/mod.rs", "rust/src/main.rs"], "rust/src"),
    ["rust/src/domain/mod.rs", "rust/src/main.rs"],
  );
});

test("discovers ordinary Rust modules while excluding crate roots", () => {
  const root = mkdtempSync(resolve(tmpdir(), "vooya-build-core-"));
  try {
    mkdirSync(resolve(root, "src/domain"), { recursive: true });
    writeFileSync(resolve(root, "src/lib.rs"), "mod domain;\n");
    writeFileSync(resolve(root, "src/main.rs"), "fn main() {}\n");
    writeFileSync(resolve(root, "src/domain/cart.rs"), "pub struct Cart;\n");
    assert.deepEqual(discoverRustSourceFiles(root), [resolve(root, "src/domain/cart.rs")]);
    assert.equal(resolveVooyaCrateRoot(root), undefined);
    assert.equal(resolveVooyaCrateRoot(root, "src/lib.rs"), resolve(root, "src/lib.rs"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});