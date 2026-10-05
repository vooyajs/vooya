// Install only tarballs into an independent app. Host SDK/linker remains available;
// PATH shims reject ambient Rust tools while the preset uses its absolute paths.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startDevServer, stopDevServer } from "./helpers/dev-server.mjs";
const root = mkdtempSync(join(tmpdir(), "vooya-preset-consumer-"));
const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const cacheDirectory = resolve(process.env.VOOYA_CACHE_DIR || join(root, "cache"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
let server;
let browser;
let output = "";
let spawnError;
function run(args, cwd, env = process.env) {
  const result = spawnSync(npm, args, { cwd, env, encoding: "utf8", shell: process.platform === "win32" });
  assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message);
  return result.stdout;
}
try {
  const app = join(root, "app");
  mkdirSync(join(app, "src"), { recursive: true });
  const packs = join(root, "packs");
  mkdirSync(packs);
  const tarballs = ["preset", "core", "compiler", "provider-rust", "build-core", "vite", "vue"].map(name => {
    const [packed] = JSON.parse(run(["pack", "--workspace", `@vooya/${name}`, "--pack-destination", packs, "--json"], repositoryRoot));
    return join(packs, packed.filename);
  });
  writeFileSync(join(app, "package.json"), JSON.stringify({ name: "preset-consumer", private: true, type: "module", scripts: { dev: "vite", build: "vite build", doctor: "vooya doctor --json" }, dependencies: { vue: "^3.5.0" }, devDependencies: { vite: "^7.0.0", "@vitejs/plugin-vue": "^6.0.0" } }));
  run(["install", "--save-dev", "--no-audit", "--no-fund", ...tarballs], app);
  for (const name of ["Counter.rs", "Counter.css", "Store.rs", "main.js"]) copyFileSync(join(repositoryRoot, "tests/fixtures/rust-vue/src", name), join(app, "src", name));
  copyFileSync(join(repositoryRoot, "tests/fixtures/rust-vue/index.html"), join(app, "index.html"));
  writeFileSync(join(app, "vite.config.js"), 'import {defineConfig} from "vite"; import vue from "@vitejs/plugin-vue"; import {vooya} from "@vooya/vite"; export default defineConfig({plugins:[vue(),vooya({framework:"vue"})]});');
  writeFileSync(join(app, "src/App.vue"), `<script setup>\nimport {computed} from 'vue'; import Counter from './Counter.rs'; import {useCart} from './Store.rs'; const {state,add}=useCart(); const count=computed(()=>state.value?.count??0); const selection=computed(()=>({id:count.value,tags:['managed']}));\n</script><template><Counter :count="count" :selection="selection"/><button @click="add(1)">Store: {{count}}</button></template>`);
  const blocked = join(root, "blocked-tools");
  mkdirSync(blocked);
  for (const tool of ["cargo", "rustc", "rustup", "wasm-bindgen"]) {
    writeFileSync(join(blocked, tool + (process.platform === "win32" ? ".cmd" : "")), process.platform === "win32" ? '@echo off\necho AMBIENT_RUST_BLOCKED 1>&2\nexit /b 97\n' : '#!/bin/sh\necho AMBIENT_RUST_BLOCKED >&2\nexit 97\n', { mode: 0o755 });
  }
  const env = { ...process.env, PATH: [blocked, dirname(process.execPath), process.env.PATH ?? process.env.Path ?? ""].join(delimiter), VOOYA_CACHE_DIR: cacheDirectory, VOOYA_TOOLCHAIN: "auto", RUSTC: join(blocked, "rustc") };
  if (process.platform === "win32") delete env.Path;
  for (const tool of ["cargo", "rustc", "rustup", "wasm-bindgen"]) {
    const ambient = spawnSync(tool, ["--version"], { env, encoding: "utf8", shell: process.platform === "win32" });
    assert.equal(ambient.status, 97, `ambient ${tool} must be blocked`);
  }
  writeFileSync(join(app, "probe.mjs"), `import assert from 'node:assert/strict'; import {prepareToolchain} from '@vooya/preset'; import {resolveToolchain} from '@vooya/build-core'; const [a,b]=await Promise.all([prepareToolchain(),prepareToolchain()]); assert.equal(a.cargoPath,b.cargoPath); const t=resolveToolchain({cwd:process.cwd(),env:process.env}); assert.equal(t.cargoSelection,'managed'); assert.equal(t.cargo.path,a.cargoPath); assert.ok(t.cargo.path.startsWith(process.env.VOOYA_CACHE_DIR)); assert.match(t.rustc.version,/1\\.94\\.0/); const explicit=resolveToolchain({cwd:process.cwd(),env:t.environment,mode:'system',cargoPath:t.cargo.path}); assert.equal(explicit.cargoSelection,'explicit'); console.log(JSON.stringify(t));`);
  const probe = spawnSync(process.execPath, ["probe.mjs"], { cwd: app, env, encoding: "utf8" });
  assert.equal(probe.status, 0, probe.stderr);
  const toolchain = JSON.parse(probe.stdout);
  const doctor = JSON.parse(run(["run", "--silent", "doctor"], app, env));
  assert.equal(doctor.ok, true, JSON.stringify(doctor));
  assert.equal(doctor.schemaVersion, 1);
  assert.equal(doctor.cargo.selection, "managed");
  assert.equal(doctor.cargo.path, toolchain.cargo.path);
  assert.ok(doctor.rustc.path.startsWith(cacheDirectory));
  const port = await availablePort();
  server = startDevServer(npm, ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: app, env, shell: process.platform === "win32", stdio: ["ignore", "pipe", "pipe"] });
  server.on("error", error => { spawnError = error; });
  server.stdout.on("data", data => { output += data; });
  server.stderr.on("data", data => { output += data; });
  const url = `http://127.0.0.1:${port}`;
  await waitUntil(async () => { if (spawnError) throw spawnError; assert.equal(server.exitCode, null, output); assert.equal(server.signalCode, null, output); try { return (await fetch(url, { signal: AbortSignal.timeout(1000) })).ok; } catch { return false; } }, "dev server startup");
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(120_000);
  await page.goto(url);
  await page.getByRole("button", { name: "Count: 0", exact: true }).waitFor();
  await page.getByRole("button", { name: "Store: 0", exact: true }).click();
  await page.getByRole("button", { name: "Store: 1", exact: true }).waitFor();
  await page.getByRole("button", { name: "Count: 1", exact: true }).waitFor();
  const path = join(app, "src/Counter.rs");
  const source = readFileSync(path, "utf8");
  writeFileSync(path, source.replace('Count: {}', 'Managed edit: {}'));
  await page.getByRole("button", { name: /^Managed edit:/ }).waitFor();
  const errorStart = output.length;
  writeFileSync(path, source + '\nfn deliberately_invalid( {\n');
  await waitUntil(() => /error|failed/i.test(output.slice(errorStart)), "Rust error diagnostic");
  await page.locator("vite-error-overlay").waitFor({ state: "attached" });
  writeFileSync(path, source.replace('Count: {}', 'Recovered: {}'));
  await page.getByRole("button", { name: /^Recovered:/ }).waitFor();
  await page.locator("vite-error-overlay").waitFor({ state: "detached" });
  // Exercise the same ordinary build command while ambient Rust stays blocked.
  await browser.close(); browser = undefined;
  await stopServer();
  run(["run", "build"], app, env);
  console.log(`Managed packed consumer passed (${process.platform}/${process.arch}): ordinary dev/browser Component+Store, Rust edit, compiler error/recovery, production build, concurrent cache and doctor; ambient Rust commands blocked, host SDK retained.`);
} catch (error) {
  if (output) console.error(output);
  throw error;
} finally {
  try { await browser?.close(); } finally {
    try { await stopServer(); } finally {
      rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  }
}
async function waitUntil(check, label) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out: ${label}\n${output}`);
}
async function stopServer() {
  if (!server) return;
  const child = server; server = undefined;
  await stopDevServer(child);
}
async function availablePort() {
  const socket = createServer();
  await new Promise((resolve, reject) => { socket.once("error", reject); socket.listen(0, "127.0.0.1", resolve); });
  const { port } = socket.address();
  await new Promise(resolve => socket.close(resolve));
  return port;
}
