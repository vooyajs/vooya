// Real opt-in smoke: npm run build:packages first. SDK/linker stays on PATH;
// compiler selection is forced to the isolated managed installation.
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { prepareToolchain } from "../packages/preset/lib/index.js";
import { buildApplication, resolveToolchain } from "../packages/build-core/dist/index.js";
const root = mkdtempSync(join(tmpdir(), "vooya-preset-consumer-"));
const cacheDirectory = process.env.VOOYA_CACHE_DIR || join(root, "cache");
try {
  const [first, second] = await Promise.all([prepareToolchain({ cacheDirectory }), prepareToolchain({ cacheDirectory })]);
  assert.equal(first.cargoPath, second.cargoPath);
  assert.ok(first.cargoPath.startsWith(resolve(cacheDirectory)));
  assert.match(first.environment.RUSTC, /1\.94\.0/);
  const applicationRoot = join(root, "app");
  mkdirSync(join(applicationRoot, "src"), { recursive: true });
  writeFileSync(join(applicationRoot, "src/Store.rs"), readFileSync(new URL("./fixtures/rust-vue/src/Store.rs", import.meta.url)));
  const toolchain = resolveToolchain({ cwd: applicationRoot, cargoPath: first.cargoPath, env: first.environment, mode: "system" });
  const result = buildApplication({ applicationRoot, toolchain, rust: { sourceRoot: "src" } });
  assert.ok(result.wasm.bytes.length > 0);
  assert.equal(toolchain.wasmBindgen.version, "0.2.115");
  console.log(`Managed Rust/WASM real build passed (${process.platform}/${process.arch}); cache reused by concurrent preparations.`);
} finally { rmSync(root, { recursive: true, force: true }); }
