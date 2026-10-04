import assert from "node:assert/strict";
import fs, { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { parseVooComponent } from "@vooya/compiler";

import { buildApplication, discoverRustSourceFiles, findNearestCargoManifest, generateRustCrateRoot, generateRustSourceRoot, generatedCargoManifest, remapRustDiagnostic, resolveRustBuildOptions, resolveRustDependencyRoots, resolveRuntimeCrateRoot, resolveVooyaCrateRoot, rustModuleIdentifier, selectRustRootModules } from "../dist/index.js";

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

test("buildApplication rejects missing applicationRoot before creating a workspace", () => {
  const root = mkdtempSync(resolve(tmpdir(), "vooya-invalid-build-root-"));
  try {
    for (const applicationRoot of [undefined, null, ""]) {
      assert.throws(() => buildApplication({
        applicationRoot,
        workspaceRoot: resolve(root, "workspace"),
        runtimeCrateRoot: root,
        toolchain: {},
      }), { message: "Vooya build requires applicationRoot." });
      assert.deepEqual(readdirSync(root), []);
    }
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
    assert.match(generated, /\[profile\.release\][\s\S]*opt-level = "s"[\s\S]*lto = true[\s\S]*codegen-units = 1[\s\S]*panic = "abort"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("buildApplication recovers from a stale workspace lock", () => {
  const root = mkdtempSync(resolve(tmpdir(), "vooya-stale-lock-"));
  const workspaceRoot = resolve(root, ".vooya");
  const toolchain = {
    environment: {},
    cargo: { path: "/selected/cargo", version: "cargo 1.94.0" },
    rustc: { path: "/selected/rustc", version: "rustc 1.94.0", verboseVersion: "rustc 1.94.0", sysroot: "/selected" },
    target: { triple: "wasm32-unknown-unknown", libdir: "/selected/wasm" },
    wasmBindgen: { path: "/selected/wasm-bindgen", version: "0.2.115" },
  };
  try {
    mkdirSync(workspaceRoot, { recursive: true });
    writeFileSync(resolve(workspaceRoot, ".build.lock"), "2147483647\n");
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
    assert.equal(existsSync(resolve(workspaceRoot, ".build.lock")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("keeps the last successful WASM artifact when binding generation fails", () => {
  const root = mkdtempSync(resolve(tmpdir(), "vooya-staged-output-"));
  const workspaceRoot = resolve(root, ".vooya");
  const toolchain = {
    environment: {},
    cargo: { path: "/selected/cargo", version: "cargo 1.94.0" },
    rustc: { path: "/selected/rustc", version: "rustc 1.94.0", verboseVersion: "rustc 1.94.0", sysroot: "/selected" },
    target: { triple: "wasm32-unknown-unknown", libdir: "/selected/wasm" },
    wasmBindgen: { path: "/selected/wasm-bindgen", version: "0.2.115" },
  };
  const options = {
    applicationRoot: root,
    runtimeCrateRoot: "/runtime",
    workspaceRoot,
    toolchain,
    spawn() { return { status: 0, stdout: "", stderr: "" }; },
  };
  try {
    buildApplication({
      ...options,
      exec(command, args) {
        const outputDir = args[args.indexOf("--out-dir") + 1];
        writeFileSync(resolve(outputDir, "vooya_app.js"), "old loader");
        writeFileSync(resolve(outputDir, "vooya_app_bg.wasm"), Buffer.from("old wasm"));
      },
    });
    assert.throws(
      () => buildApplication({ ...options, exec() { throw new Error("binding failed"); } }),
      /wasm-bindgen failed/,
    );
    assert.equal(readFileSync(resolve(workspaceRoot, "wasm/vooya_app.js"), "utf8"), "old loader");
    assert.deepEqual(readFileSync(resolve(workspaceRoot, "wasm/vooya_app_bg.wasm")), Buffer.from("old wasm"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function readOutputTree(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => [entry.name, entry.isDirectory()
      ? readOutputTree(resolve(directory, entry.name))
      : readFileSync(resolve(directory, entry.name))]);
}

for (const failure of ["CSS transformation", "declaration generation", "runtime JavaScript read", "metadata write", "metadata installation"]) {
  test(`preserves all previous artifacts and metadata after ${failure} fails`, () => {
    const root = mkdtempSync(resolve(tmpdir(), "vooya-late-build-failure-"));
    const workspaceRoot = resolve(root, ".vooya");
    const outputDir = resolve(workspaceRoot, "wasm");
    const metadataPath = resolve(workspaceRoot, "metadata.json");
    const originalWrite = fs.writeFileSync;
    const originalRename = fs.renameSync;
    const toolchain = {
      environment: {},
      cargo: { path: "/selected/cargo", version: "cargo 1.94.0" },
      rustc: { path: "/selected/rustc", version: "rustc 1.94.0", verboseVersion: "rustc 1.94.0", sysroot: "/selected" },
      target: { triple: "wasm32-unknown-unknown", libdir: "/selected/wasm" },
      wasmBindgen: { path: "/selected/wasm-bindgen", version: "0.2.115" },
    };
    const options = {
      applicationRoot: root,
      runtimeCrateRoot: "/runtime",
      workspaceRoot,
      toolchain,
      spawn() { return { status: 0, stdout: "", stderr: "" }; },
    };
    let stagingOutput;
    let injectedFailure = false;
    try {
      buildApplication({
        ...options,
        exec(command, args) {
          const directory = args[args.indexOf("--out-dir") + 1];
          writeFileSync(resolve(directory, "vooya_app.js"), "old loader");
          writeFileSync(resolve(directory, "vooya_app_bg.wasm"), Buffer.from("old wasm"));
          mkdirSync(resolve(directory, "snippets"));
          writeFileSync(resolve(directory, "snippets/helper.js"), "old supporting module");
        },
      });
      const oldOutput = readOutputTree(outputDir);
      const oldMetadata = readFileSync(metadataPath);
      const workspaceEntries = readdirSync(workspaceRoot).sort();
      const component = parseVooComponent(`<component name="Counter">
props:
  initial: i32 = 0
</component>
<rust>
fn counter() {}
</rust>
<style scoped>
.counter { display: flex; }
</style>`, resolve(root, "Counter.voo"));
      if (failure === "CSS transformation") component.style.content = ".counter {";
      if (failure === "metadata write") {
        fs.writeFileSync = (path, data, ...args) => {
          if (String(path).startsWith(`${metadataPath}.staging-`)) {
            injectedFailure = true;
            originalWrite(path, '{"partial":', ...args);
            throw Object.assign(new Error("injected metadata write failure"), { code: "EIO" });
          }
          return originalWrite(path, data, ...args);
        };
      }
      if (failure === "metadata installation") {
        fs.renameSync = (source, destination) => {
          if (String(source).startsWith(`${metadataPath}.staging-`) && String(destination) === metadataPath) {
            // The new output is already installed: this exercises rollback,
            // rather than merely rejecting a candidate before commit begins.
            assert.equal(readFileSync(resolve(outputDir, "vooya_app.js"), "utf8"), "new loader");
            injectedFailure = true;
            throw Object.assign(new Error("injected metadata installation failure"), { code: "EIO" });
          }
          return originalRename(source, destination);
        };
      }
      syncBuiltinESMExports();
      const expectedError = {
        "CSS transformation": /Unclosed block/,
        "declaration generation": /Unknown Vooya framework/,
        "runtime JavaScript read": /ENOENT.*vooya_app\.js/,
        "metadata write": /injected metadata write failure/,
        "metadata installation": /injected metadata installation failure/,
      }[failure];
      assert.throws(() => buildApplication({
        ...options,
        components: [component],
        framework: failure === "declaration generation" ? "unsupported" : "vue",
        toolchain: { ...toolchain, cargo: { ...toolchain.cargo, version: "cargo candidate" } },
        exec(command, args) {
          stagingOutput = args[args.indexOf("--out-dir") + 1];
          if (failure !== "runtime JavaScript read") {
            writeFileSync(resolve(stagingOutput, "vooya_app.js"), "new loader");
          }
          writeFileSync(resolve(stagingOutput, "vooya_app_bg.wasm"), Buffer.from("new wasm"));
        },
      }), expectedError);
      assert.ok(stagingOutput, "failure must occur after binding generation");
      if (failure.startsWith("metadata")) assert.equal(injectedFailure, true);
      assert.deepEqual(readOutputTree(outputDir), oldOutput);
      assert.deepEqual(readFileSync(metadataPath), oldMetadata);
      assert.equal(existsSync(stagingOutput), false, "failed output staging must be removed");
      assert.deepEqual(readdirSync(workspaceRoot).sort(), workspaceEntries, "no staging, backup, or lock files may remain");
    } finally {
      fs.writeFileSync = originalWrite;
      fs.renameSync = originalRename;
      syncBuiltinESMExports();
      rmSync(root, { recursive: true, force: true });
    }
  });
}

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

test("maps diagnostics from copied multi-file modules back to authored files", () => {
  const generatedRoot = resolve("/project/.vooya/build");
  const generated = resolve(generatedRoot, "src/rust/src/MathPlot/series.rs");
  const authored = resolve("/project/src/MathPlot/series.rs");
  const diagnostic = remapRustDiagnostic({
    level: "error",
    message: "missing method",
    rendered: "error\n --> src/rust/src/MathPlot/series.rs:2:15\n  |\n2 | missing\n",
    spans: [{ file_name: "src/rust/src/MathPlot/series.rs", line_start: 2, column_start: 15 }],
  }, new Map([[generated, { id: authored, startLine: 1, generatedLineOffset: 0 }]]), generatedRoot);
  assert.ok(diagnostic.includes(`${authored}:2:15`), diagnostic);
  assert.doesNotMatch(diagnostic, /src\/rust\/src\/MathPlot\/series\.rs:2:15/);
});

test("generates deterministic Rust module declarations", () => {
  assert.equal(rustModuleIdentifier("widgets/cart-item.rs"), "cart_item");
  assert.equal(rustModuleIdentifier("widgets/MathPlot.rs"), "math_plot");
  assert.equal(rustModuleIdentifier("widgets/HTTPClient.rs"), "http_client");
  assert.equal(rustModuleIdentifier("widgets/123.rs"), "module");
  assert.equal(rustModuleIdentifier("widgets/Type.rs"), "module_type");
  assert.equal(rustModuleIdentifier("widgets/Mod.rs"), "module_mod");
  assert.equal(rustModuleIdentifier("widgets/Try.rs"), "module_try");
  const root = generateRustCrateRoot(
    ["rust/z.rs", "rust/a.rs", "rust/a.test.rs", "rust/123.rs", "rust/Type.rs"],
    ["rust/a.rs"],
  );
  assert.match(root, /#\[path = "rust\/a\.rs"\] pub mod a;/);
  assert.match(root, /#\[path = "rust\/a\.test\.rs"\] mod a_test;/);
  assert.match(root, /#\[path = "rust\/123\.rs"\] mod module;/);
  assert.match(root, /#\[path = "rust\/Type\.rs"\] mod module_type;/);
  assert.match(root, /#\[path = "rust\/z\.rs"\] mod z;/);
  assert.deepEqual(
    selectRustRootModules(["rust/src/domain/cart.rs", "rust/src/domain/mod.rs", "rust/src/main.rs"], "rust/src"),
    ["rust/src/domain/mod.rs", "rust/src/main.rs"],
  );
});

test("generates a conventional authored root for multi-file Rust modules", () => {
  const root = generateRustSourceRoot([
    "rust/src/MathPlot.rs",
    "rust/src/MathPlot/spec.rs",
    "rust/src/components/mod.rs",
    "rust/src/components/math/MathLab.rs",
  ], ["rust/src/MathPlot.rs"], "rust/src");
  assert.match(root, /#\[allow\(non_snake_case\)\]\npub mod MathPlot;/);
  assert.match(root, /#\[allow\(non_snake_case\)\]\nmod components;/);
  assert.doesNotMatch(root, /spec|MathLab/);
});

test("renamed Rust modules retain their authored path after an identifier collision", () => {
  const root = generateRustSourceRoot([
    "rust/src/a-b.rs",
    "rust/src/a_b.rs",
  ], ["rust/src/a_b.rs"], "rust/src");
  assert.equal(root, '#[path = "a-b.rs"]\nmod a_b;\n#[path = "a_b.rs"]\npub mod a_b_2;\n');
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


test("sourceRoot dot selects top-level Rust modules and ignores installed packages", () => {
  assert.match(generateRustSourceRoot(["rust/Counter.rs"], [], "rust/."), /mod Counter;/);
  const root = mkdtempSync(resolve(tmpdir(), "vooya-source-dot-"));
  try {
    mkdirSync(resolve(root, "node_modules/library"), { recursive: true });
    writeFileSync(resolve(root, "Counter.rs"), "// authored");
    writeFileSync(resolve(root, "node_modules/library/Internal.rs"), "// dependency");
    assert.deepEqual(discoverRustSourceFiles(root, "."), [resolve(root, "Counter.rs")]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

for (const prefix of ["rust/.", "rust/unused/..", "rust\\."]) {
  test(`preserves public modules with normalized sourceRoot ${prefix}`, () => {
    const publicFiles = [`${prefix}/Counter.rs`];
    assert.deepEqual(selectRustRootModules(publicFiles, prefix), ["rust/Counter.rs"]);
    assert.match(generateRustSourceRoot(["rust/Counter.rs"], publicFiles, prefix), /pub mod Counter;/);
  });
}
