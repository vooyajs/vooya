import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { prepareRustModules, rustInputFingerprint } from "../dist/rust-bundler.js";

test("Rust watch ignores generated assets and JS but sees new Rust and linked CSS", () => {
  const root = mkdtempSync(resolve(tmpdir(), "vooya-watch-inputs-"));
  try {
    const workspace = resolve(root, ".vooya");
    const output = resolve(root, "dist");
    mkdirSync(workspace);
    mkdirSync(output);
    const style = resolve(root, "Counter.css");
    writeFileSync(resolve(root, "Counter.rs"), "// source");
    writeFileSync(style, "button {}\n");
    const stamp = () => rustInputFingerprint([root, style], workspace, output);
    const original = stamp();
    writeFileSync(resolve(workspace, "Generated.rs"), "// generated");
    writeFileSync(resolve(output, "main.js"), "// bundled");
    writeFileSync(resolve(root, "App.js"), "// host edit");
    assert.equal(stamp(), original);
    const added = resolve(root, "Extra.rs");
    writeFileSync(added, "// new source");
    assert.notEqual(stamp(), original);
    rmSync(added);
    assert.equal(stamp(), original);
    writeFileSync(style, "button { color: red }\n");
    assert.notEqual(stamp(), original);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("unchanged generated Rust CSS preserves its filesystem timestamp", () => {
  const root = mkdtempSync(resolve(tmpdir(), "vooya-watch-css-"));
  try {
    writeFileSync(resolve(root, "Counter.rs"), "// source");
    writeFileSync(resolve(root, "Counter.css"), "button { color: red }\n");
    const stylesRoot = resolve(root, ".vooya/styles");
    const options = {
      applicationRoot: root, workspaceRoot: resolve(root, ".vooya"), stylesRoot,
      runtimeModule: "runtime.js", runtimeHelpers: "@vooya/webpack/runtime", framework: "vue",
      schema: { version: 1, records: [{ version: 1, kind: "component", id: "Counter", name: "Counter", group: "Counter.rs", params: [], styles: [{ path: "Counter.css", scoped: true }] }] },
    };
    prepareRustModules(options);
    const css = resolve(stylesRoot, readdirSync(stylesRoot)[0]);
    utimesSync(css, 1000, 1000);
    prepareRustModules(options);
    assert.equal(statSync(css).mtimeMs, 1000000);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
