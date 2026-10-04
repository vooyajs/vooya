// Real opt-in smoke: build packages first. SDK/linker stays on PATH, while
// compiler selection is forced to the isolated managed installation.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareToolchain } from "../packages/preset/lib/index.js";
import { buildApplication, resolveToolchain } from "../packages/build-core/dist/index.js";
import { inspectToolchain } from "../packages/vite/dist/doctor.js";
const root = mkdtempSync(join(tmpdir(), "vooya-preset-consumer-"));
const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const cacheDirectory = process.env.VOOYA_CACHE_DIR || join(root, "cache");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
function run(args, cwd) {
  const result = spawnSync(npm, args, { cwd, encoding: "utf8", shell: process.platform === "win32" });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return result.stdout;
}
try {
  const applicationRoot = join(root, "app");
  mkdirSync(join(applicationRoot, "src"), { recursive: true });
  writeFileSync(join(applicationRoot, "package.json"), JSON.stringify({ name: "preset-consumer", private: true }));
  const packed = JSON.parse(run(["pack", "--workspace", "@vooya/preset", "--pack-destination", root, "--json"], repositoryRoot));
  run(["install", "--save-dev", "--ignore-scripts", "--no-audit", "--no-fund", join(root, packed[0].filename)], applicationRoot);

  const [first, second] = await Promise.all([prepareToolchain({ cacheDirectory }), prepareToolchain({ cacheDirectory })]);
  assert.equal(first.cargoPath, second.cargoPath);
  assert.ok(first.cargoPath.startsWith(resolve(cacheDirectory)));
  const env = { ...process.env, VOOYA_CACHE_DIR: cacheDirectory, VOOYA_TOOLCHAIN: "auto", RUSTC: "/deliberately-missing-system-rustc" };
  const toolchain = resolveToolchain({ cwd: applicationRoot, env });
  assert.equal(toolchain.cargoSelection, "managed");
  assert.equal(toolchain.cargo.path, first.cargoPath);
  assert.match(toolchain.rustc.version, /1\.94\.0/);
  const explicit = resolveToolchain({ cwd: applicationRoot, env: toolchain.environment, mode: "system", cargoPath: toolchain.cargo.path });
  assert.equal(explicit.cargoSelection, "explicit");
  const report = inspectToolchain({ cwd: applicationRoot, env });
  assert.equal(report.ok, true, JSON.stringify(report.results));
  assert.equal(report.toolchain.cargo.path, toolchain.cargo.path);
  const source = readFileSync(new URL("./fixtures/rust-vue/src/Store.rs", import.meta.url));
  const sourcePath = join(applicationRoot, "src/Store.rs");
  writeFileSync(sourcePath, source);
  // Leave toolchain unspecified: ordinary build-core calls discover the packed preset.
  const previousCache = process.env.VOOYA_CACHE_DIR;
  process.env.VOOYA_CACHE_DIR = cacheDirectory;
  try {
    const result = buildApplication({ applicationRoot, rust: { sourceRoot: "src" }, buildMode: "development" });
    assert.ok(result.wasm.bytes.length > 0);
    writeFileSync(sourcePath, "this is not Rust;\n");
    assert.throws(() => buildApplication({ applicationRoot, rust: { sourceRoot: "src" }, buildMode: "development" }), /Cargo build failed/);
    writeFileSync(sourcePath, source);
    const recovered = buildApplication({ applicationRoot, rust: { sourceRoot: "src" }, buildMode: "production" });
    assert.ok(recovered.wasm.bytes.length > 0);
  } finally {
    if (previousCache === undefined) delete process.env.VOOYA_CACHE_DIR;
    else process.env.VOOYA_CACHE_DIR = previousCache;
  }
  console.log(`Managed Rust/WASM passed (${process.platform}/${process.arch}): packed preset, auto discovery, doctor, concurrent cache reuse, dev/prod and recovery after a Rust error.`);
} finally { rmSync(root, { recursive: true, force: true }); }
