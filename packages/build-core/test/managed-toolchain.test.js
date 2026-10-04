import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { prepareProjectToolchain } from "../dist/managed-toolchain.js";

test("system selection never loads the project preset; explicit Cargo preserves existing behavior", () => {
  assert.equal(prepareProjectToolchain({ cwd: process.cwd(), env: {}, mode: "system" }), undefined);
  assert.equal(prepareProjectToolchain({ cwd: process.cwd(), env: {}, cargoPath: "/custom/cargo" }), undefined);
  assert.throws(() => prepareProjectToolchain({ cwd: process.cwd(), env: {}, cargoPath: "/custom/cargo", mode: "managed" }), /cannot be combined/);
});
test("auto selects a declared project preset and merges only its returned environment", () => {
  const cwd = mkdtempSync(join(tmpdir(), "vooya-preset-project-"));
  try {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ devDependencies: { "@vooya/preset": "0.0.0" } }));
    const preset = join(cwd, "node_modules/@vooya/preset");
    mkdirSync(preset, { recursive: true });
    writeFileSync(join(preset, "package.json"), JSON.stringify({ type: "module", exports: { "./prepare": "./prepare.js" } }));
    writeFileSync(join(preset, "prepare.js"), `console.log(JSON.stringify({cargoPath:'/managed/cargo',environment:{RUSTC:'/managed/rustc',RUSTC_WRAPPER:null}}));`);
    const result = prepareProjectToolchain({ cwd, env: { APP_VALUE: "preserved", RUSTC_WRAPPER: "old" } });
    assert.equal(result.cargoPath, "/managed/cargo");
    assert.deepEqual(result.environment, { APP_VALUE: "preserved", RUSTC: "/managed/rustc" });
    assert.equal(prepareProjectToolchain({ cwd, env: { VOOYA_TOOLCHAIN: "system" } }), undefined);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
test("managed installation failure does not silently choose system tools", () => {
  const cwd = mkdtempSync(join(tmpdir(), "vooya-preset-missing-"));
  try { assert.throws(() => prepareProjectToolchain({ cwd, env: {}, mode: "managed" }), /require @vooya\/preset/); }
  finally { rmSync(cwd, { recursive: true, force: true }); }
});
