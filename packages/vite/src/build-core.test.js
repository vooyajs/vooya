import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { CargoBuildError, VooyaUserError } from "@vooya/build-core";
import {
  buildApplication,
  generatedCargoManifest,
  remapRustDiagnostic,
  resolveRustDependencyRoots,
  resolveRuntimeCrateRoot,
} from "../dist/build-core.js";

test("resolves the Rust runtime shipped by @vooya/core", () => {
  const runtime = resolveRuntimeCrateRoot();

  assert.equal(existsSync(`${runtime}/Cargo.toml`), true);
  assert.equal(existsSync(`${runtime}/src/lib.rs`), true);
});

test("build uses the paths selected by the resolved toolchain", () => {
  const root = mkdtempSync(join(tmpdir(), "vooya-build-test-"));
  const calls = { cargo: null, wasmBindgen: null };
  const environment = { PATH: "/selected/toolchain/bin" };
  const toolchain = {
    environment,
    cargo: { path: "/selected/toolchain/bin/cargo", version: "cargo 1.94.0" },
    rustc: {
      path: "/selected/toolchain/bin/rustc",
      version: "rustc 1.94.0",
      verboseVersion: "rustc 1.94.0",
      sysroot: "/selected/toolchain",
    },
    target: { triple: "wasm32-unknown-unknown", libdir: "/selected/toolchain/wasm" },
    wasmBindgen: { path: "/selected/toolchain/bin/wasm-bindgen", version: "0.2.115" },
  };

  try {
    buildApplication({
      applicationRoot: root,
      runtimeCrateRoot: "/runtime",
      cacheRoot: join(root, "cache"),
      outputDir: join(root, "dist"),
      toolchain,
      spawn(command, args, options) {
        calls.cargo = { command, args, options };
        return { status: 0, stdout: "", stderr: "" };
      },
      exec(command, args, options) {
        calls.wasmBindgen = { command, args, options };
        const outputDir = args[args.indexOf("--out-dir") + 1];
        writeFileSync(join(outputDir, "vooya_app.js"), "");
        writeFileSync(join(outputDir, "vooya_app_bg.wasm"), Buffer.alloc(0));
      },
    });
  } finally {
    rmSync(root, { force: true, recursive: true });
  }

  assert.equal(calls.cargo.command, toolchain.cargo.path);
  assert.equal(calls.wasmBindgen.command, toolchain.wasmBindgen.path);
  assert.equal(calls.cargo.options.env.PATH, environment.PATH);
  assert.equal(calls.wasmBindgen.options.env, environment);
  assert.equal(calls.cargo.args.includes("--target"), true);
  assert.equal(calls.cargo.args.includes("wasm32-unknown-unknown"), true);
});

test("preserves Cargo process startup errors", () => {
  const root = mkdtempSync(join(tmpdir(), "vooya-build-error-test-"));
  const startupError = Object.assign(new Error("cargo could not start"), { code: "ENOENT" });
  const toolchain = {
    environment: {},
    cargo: { path: "/missing/cargo", version: "cargo 1.94.0" },
    rustc: { path: "/missing/rustc", version: "rustc 1.94.0", verboseVersion: "rustc 1.94.0", sysroot: "/missing" },
    target: { triple: "wasm32-unknown-unknown", libdir: "/missing/wasm" },
    wasmBindgen: { path: "/missing/wasm-bindgen", version: "0.2.115" },
  };

  try {
    assert.throws(
      () =>
        buildApplication({
          applicationRoot: root,
          runtimeCrateRoot: "/runtime",
          cacheRoot: join(root, "cache"),
          outputDir: join(root, "dist"),
          toolchain,
          spawn() {
            return { error: startupError, status: null, stdout: null, stderr: null };
          },
          exec() {},
        }),
      (error) => {
        assert.equal(error instanceof VooyaUserError, true);
        assert.equal(error.kind, "cargo-start");
        assert.equal(error.debugCause, startupError);
        assert.equal(error.stack, `${error.name}: ${error.message}\n`);
        return true;
      },
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("suppresses JavaScript stack details for Cargo build failures", () => {
  const root = mkdtempSync(join(tmpdir(), "vooya-build-failure-test-"));
  const toolchain = {
    environment: {},
    cargo: { path: "/selected/cargo", version: "cargo 1.94.0" },
    rustc: { path: "/selected/rustc", version: "rustc 1.94.0", verboseVersion: "rustc 1.94.0", sysroot: "/selected" },
    target: { triple: "wasm32-unknown-unknown", libdir: "/selected/wasm" },
    wasmBindgen: { path: "/selected/wasm-bindgen", version: "0.2.115" },
  };

  try {
    assert.throws(
      () =>
        buildApplication({
          applicationRoot: root,
          runtimeCrateRoot: "/runtime",
          cacheRoot: join(root, "cache"),
          outputDir: join(root, "dist"),
          toolchain,
          spawn() {
            return { status: 101, stdout: "", stderr: "error: invalid Rust\n" };
          },
          exec() {},
        }),
      (error) => {
        assert.equal(error instanceof CargoBuildError, true);
        assert.equal(error.stack, `${error.name}: ${error.message}\n`);
        assert.match(error.debugStack, /runCargo/);
        assert.equal(error.exitCode, 101);
        return true;
      },
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("generates a standalone application crate", () => {
  const manifest = generatedCargoManifest({
    applicationRoot: "/consumer",
    runtimeCrateRoot: "/consumer/node_modules/@vooya/core/rust",
  });

  assert.match(manifest, /name = "vooya-app"/);
  assert.match(manifest, /^\[workspace\]$/m);
  assert.match(
    manifest,
    /vooya-core = \{ path = "\/consumer\/node_modules\/@vooya\/core\/rust" \}/,
  );
  assert.match(manifest, /crate-type = \["cdylib"\]/);
});

test("adds the public vooya authoring crate for Rust-file sources", () => {
  const manifest = generatedCargoManifest({
    applicationRoot: "/consumer",
    runtimeCrateRoot: "/consumer/node_modules/@vooya/core/rust",
    authoringCrateRoot: "/consumer/node_modules/@vooya/core/authoring",
  });
  assert.match(manifest, /vooya = \{ path = "\/consumer\/node_modules\/@vooya\/core\/authoring" \}/);
});

test("generates structured application dependencies and browser features", () => {
  const manifest = generatedCargoManifest({
    applicationRoot: "/consumer",
    runtimeCrateRoot: "/runtime",
    rust: {
      dependencies: {
        serde: { version: "1", features: ["derive"], defaultFeatures: false },
        "shared-math": { path: "rust/shared-math" },
      },
      webSysFeatures: ["HtmlCanvasElement"],
    },
  });

  assert.match(
    manifest,
    /"serde" = \{ version = "1", default-features = false, features = \["derive"\] \}/,
  );
  assert.match(manifest, /"shared-math" = \{ path = "\/consumer\/rust\/shared-math" \}/);
  assert.match(manifest, /"HtmlCanvasElement"/);
});

test("rejects overrides of compiler-managed Rust dependencies", () => {
  assert.throws(
    () =>
      generatedCargoManifest({
        applicationRoot: "/consumer",
        runtimeCrateRoot: "/runtime",
        rust: { dependencies: { "web-sys": "1" } },
      }),
    /managed by Vooya/,
  );
});

test("resolves path dependencies from the application root", () => {
  assert.deepEqual(
    resolveRustDependencyRoots(
      {
        dependencies: {
          serde: "1",
          shared: { path: "rust/shared" },
        },
      },
      "/consumer",
    ),
    ["/consumer/rust/shared"],
  );
});

test("maps extracted Rust diagnostics back to the voo source", () => {
  const generated = "/project/target/vooya/components/0-Counter.rs";
  const diagnostic = remapRustDiagnostic(
    {
      level: "error",
      message: "cannot find value `missing` in this scope",
      rendered: `error: cannot find value\n --> ${generated}:4:9\n  |\n4 | missing\n  | ^^^^^^^\n`,
      spans: [{ file_name: generated, line_start: 4, column_start: 9 }],
    },
    new Map([
      [
        generated,
        { id: "/project/src/Counter.voo", startLine: 10, generatedLineOffset: 1 },
      ],
    ]),
  );

  assert.match(diagnostic, /\/project\/src\/Counter\.voo:12:9/);
  assert.match(diagnostic, /12 \| missing/);
  assert.doesNotMatch(diagnostic, /0-Counter\.rs:4:9/);
});
