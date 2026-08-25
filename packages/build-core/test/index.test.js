import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import { buildApplication, discoverRustSourceFiles, findNearestCargoManifest, generateRustCrateRoot, generatedCargoManifest, remapRustDiagnostic, resolveRustBuildOptions, resolveRustDependencyRoots, resolveRuntimeCrateRoot, resolveVooyaCrateRoot, rustModuleIdentifier, selectRustRootModules } from "../dist/index.js";

test("exposes a bundler-neutral runtime and dependency watch roots", () => {
  assert.equal(existsSync(`${resolveRuntimeCrateRoot()}/Cargo.toml`), true);
  assert.deepEqual(resolveRustDependencyRoots({ dependencies: { shared: { path: "rust/shared" } } }, "/consumer"), [resolve("/consumer", "rust/shared")]);
});

test("build manifest keeps compiler-managed dependencies pinned", () => {
  const manifest = generatedCargoManifest({ applicationRoot: "/consumer", runtimeCrateRoot: "/runtime", rust: { dependencies: { serde: { version: "1", features: ["derive"] } } } });
  assert.match(manifest, /vooya-core = \{ path = "\/runtime" \}/);
  assert.match(manifest, /wasm-bindgen = "=0\.2\.115"/);
  assert.match(manifest, /"serde" = \{ version = "1", features = \["derive"\] \}/);
  assert.throws(() => generatedCargoManifest({ applicationRoot: "/consumer", runtimeCrateRoot: "/runtime", rust: { dependencies: { "web-sys": "1" } } }), /managed by Vooya/);
});

test("inherits Rust dependencies from the nearest Cargo manifest", () => {
  const root = mkdtempSync(resolve(tmpdir(), "vooya-cargo-manifest-"));
  try {
    mkdirSync(resolve(root, ".git"));
    mkdirSync(resolve(root, "app/rust/src"), { recursive: true });
    writeFileSync(resolve(root, "Cargo.toml"), '[dependencies]\nouter = "1"\n');
    writeFileSync(resolve(root, "app/rust/Cargo.toml"), `
[dependencies]
serde = { version = "1", features = ["derive"] }
shared = { path = "../shared" }
web-sys = { version = "0.3", features = ["HtmlCanvasElement"] }
wasm-bindgen = "0.2"
`);

    const applicationRoot = resolve(root, "app");
    const manifestPath = resolve(root, "app/rust/Cargo.toml");
    assert.equal(
      findNearestCargoManifest(applicationRoot, { sourceRoot: "rust/src" }),
      manifestPath,
    );
    const resolved = resolveRustBuildOptions(applicationRoot, { sourceRoot: "rust/src" });
    assert.equal(resolved.manifestPath, manifestPath);
    assert.deepEqual(resolved.rust.dependencies.serde, { version: "1", features: ["derive"] });
    assert.deepEqual(resolved.rust.dependencies.shared, { path: resolve(root, "app/shared") });
    assert.equal(resolved.rust.dependencies.outer, undefined);
    assert.deepEqual(resolved.rust.webSysFeatures, ["HtmlCanvasElement"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("explicit vooya Rust options override Cargo manifest defaults", () => {
  const root = mkdtempSync(resolve(tmpdir(), "vooya-cargo-precedence-"));
  try {
    mkdirSync(resolve(root, ".git"));
    writeFileSync(resolve(root, "Cargo.toml"), `
[dependencies]
serde = "1"
shared = { path = "cargo-shared" }
web-sys = { version = "0.3", features = ["HtmlCanvasElement"] }
`);
    const resolved = resolveRustBuildOptions(root, {
      dependencies: {
        serde: "2",
        shared: { path: "explicit-shared" },
      },
      webSysFeatures: ["AudioContext"],
    });
    assert.equal(resolved.rust.dependencies.serde, "2");
    assert.deepEqual(resolved.rust.dependencies.shared, { path: "explicit-shared" });
    assert.deepEqual(resolved.rust.webSysFeatures, ["AudioContext"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("buildApplication writes inherited Cargo defaults into the generated crate", () => {
  const root = mkdtempSync(resolve(tmpdir(), "vooya-cargo-build-"));
  const workspaceRoot = resolve(root, ".vooya");
  const toolchain = {
    environment: {},
    cargo: { path: "/selected/cargo", version: "cargo 1.94.0" },
    rustc: { path: "/selected/rustc", version: "rustc 1.94.0", verboseVersion: "rustc 1.94.0", sysroot: "/selected" },
    target: { triple: "wasm32-unknown-unknown", libdir: "/selected/wasm" },
    wasmBindgen: { path: "/selected/wasm-bindgen", version: "0.2.115" },
  };
  try {
    writeFileSync(resolve(root, "Cargo.toml"), `
[dependencies]
serde = { version = "1", features = ["derive"] }
web-sys = { version = "0.3", features = ["HtmlCanvasElement"] }
`);
    buildApplication({
      applicationRoot: root,
      runtimeCrateRoot: "/runtime",
      workspaceRoot,
      toolchain,
      spawn() { return { status: 0, stdout: "", stderr: "" }; },
      exec(command, args) {
        const outputDir = args[args.indexOf("--out-dir") + 1];
        writeFileSync(resolve(outputDir, "vooya_app.js"), "");
        writeFileSync(resolve(outputDir, "vooya_app_bg.wasm"), Buffer.alloc(0));
      },
    });
    const generated = readFileSync(resolve(workspaceRoot, "build/Cargo.toml"), "utf8");
    assert.match(generated, /"serde" = \{ version = "1", features = \["derive"\] \}/);
    assert.match(generated, /"HtmlCanvasElement"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("uses Vooya defaults when Cargo configuration is absent", () => {
  const root = mkdtempSync(resolve(tmpdir(), "vooya-no-cargo-"));
  try {
    assert.deepEqual(resolveRustBuildOptions(root, {}), { rust: {} });
    writeFileSync(resolve(root, "Cargo.toml"), '[package]\nname = "app"\nversion = "0.0.0"\n');
    const resolved = resolveRustBuildOptions(root, {});
    assert.deepEqual(resolved.rust.dependencies, {});
    assert.deepEqual(resolved.rust.webSysFeatures, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolves workspace dependencies and rejects incompatible managed pins", () => {
  const root = mkdtempSync(resolve(tmpdir(), "vooya-cargo-workspace-"));
  try {
    mkdirSync(resolve(root, ".git"));
    mkdirSync(resolve(root, "app"));
    writeFileSync(resolve(root, "Cargo.toml"), `
[workspace]
members = ["app"]
[workspace.dependencies]
shared = { path = "shared", features = ["base"] }
`);
    writeFileSync(resolve(root, "app/Cargo.toml"), `
[dependencies]
shared = { workspace = true, features = ["browser"] }
`);
    assert.deepEqual(resolveRustBuildOptions(resolve(root, "app")).rust.dependencies.shared, {
      path: resolve(root, "shared"),
      features: ["base", "browser"],
    });

    writeFileSync(resolve(root, "app/Cargo.toml"), '[dependencies]\nwasm-bindgen = "=0.2.114"\n');
    assert.throws(
      () => resolveRustBuildOptions(resolve(root, "app")),
      /requires wasm-bindgen =0\.2\.115/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("maps Cargo diagnostics using compiler source location metadata", () => {
  const generated = resolve("/project/cache/src/components/0-Counter.rs");
  const diagnostic = remapRustDiagnostic({ level: "error", message: "missing", rendered: `error\n --> ${generated}:4:9\n  |\n4 | missing\n`, spans: [{ file_name: generated, line_start: 4, column_start: 9 }] }, new Map([[generated, { id: "/project/src/Counter.rs", startLine: 10, generatedLineOffset: 1 }]]));
  assert.match(diagnostic, /\/project\/src\/Counter\.rs:12:9/);
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
