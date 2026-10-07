// Install tarballs or exact public registry packages into an independent app. Host SDK/linker remains available;
// PATH shims reject ambient Rust tools while the preset uses its absolute paths.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, copyFileSync, realpathSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startDevServer, stopDevServer } from "./helpers/dev-server.mjs";
const registry = process.argv.includes("--registry");
assert.ok(process.argv.slice(2).every(arg => arg === "--registry"), "Unknown consumer argument");
// Windows temp paths may use an 8.3 alias; Vite compares requests with real paths.
const root = realpathSync.native(mkdtempSync(join(tmpdir(), "vooya-preset-consumer-")));
const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const cacheDirectory = resolve(process.env.VOOYA_CACHE_DIR || join(root, "cache"));
const registryVersions = { preset: "0.2.0-alpha.0", core: "0.1.0-beta.0", compiler: "0.1.0-beta.0", "provider-rust": "0.2.0-alpha.0", "build-core": "0.2.0-alpha.0", vite: "0.2.0-alpha.0", vue: "0.2.0-alpha.0" };
const reusedCache = existsSync(cacheDirectory);
console.log(`Managed consumer start: ${registry ? "registry" : "packed"}, ${reusedCache ? "reused-external-cache" : "fresh-cache"}, ${process.platform}/${process.arch}; ambient Rust blocked, host SDK retained.`);
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
let server;
let browser;
let page;
const pageErrors = [];
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
  const packages = registry ? Object.entries(registryVersions).map(([name, version]) => `@vooya/${name}@${version}`) : Object.keys(registryVersions).map(name => {
    const [packed] = JSON.parse(run(["pack", "--workspace", `@vooya/${name}`, "--pack-destination", packs, "--json"], repositoryRoot));
    return join(packs, packed.filename);
  });
  writeFileSync(join(app, "package.json"), JSON.stringify({ name: "preset-consumer", private: true, type: "module", scripts: { dev: "vite", build: "vite build", preview: "vite preview", doctor: "vooya doctor --json" }, dependencies: { vue: "^3.5.0" }, devDependencies: { vite: "^7.0.0", "@vitejs/plugin-vue": "^6.0.0" } }));
  run(["install", "--save-dev", "--no-audit", "--no-fund", ...(registry ? ["--registry=https://registry.npmjs.org", "--cache", join(root, "npm-cache")] : []), ...packages], app);
  if (registry) {
    const lock = JSON.parse(readFileSync(join(app, "package-lock.json"), "utf8"));
    for (const [name, version] of Object.entries(registryVersions)) {
      const key = `node_modules/@vooya/${name}`;
      const installed = JSON.parse(readFileSync(join(app, key, "package.json"), "utf8"));
      assert.equal(installed.version, version);
      assert.equal(lock.packages[key].version, version);
      assert.equal(new URL(lock.packages[key].resolved).origin, "https://registry.npmjs.org");
      assert.match(lock.packages[key].integrity, /^sha512-/);
      assert.ok(!lock.packages[key].link, "registry consumer cannot use workspace links");
    }
  }
  for (const name of ["Counter.rs", "Counter.css", "Store.rs", "main.js"]) copyFileSync(join(repositoryRoot, "tests/fixtures/rust-vue/src", name), join(app, "src", name));
  copyFileSync(join(repositoryRoot, "tests/fixtures/rust-vue/index.html"), join(app, "index.html"));
  writeFileSync(join(app, "vite.config.js"), 'import {defineConfig} from "vite"; import vue from "@vitejs/plugin-vue"; import {vooya} from "@vooya/vite"; export default defineConfig({plugins:[vue(),vooya({framework:"vue"})]});');
  writeFileSync(join(app, "src/App.vue"), `<script setup>\nimport {computed} from 'vue'; import Counter from './Counter.rs'; import {useCart} from './Store.rs'; const {state,add}=useCart(); const count=computed(()=>state.value?.count??0); const selection=computed(()=>({id:count.value,tags:['managed']}));\n</script><template><Counter :count="count" :selection="selection"/><button :disabled="state === undefined" @click="add(1)">Store: {{count}}</button></template>`);
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
  writeFileSync(join(app, "probe.mjs"), `import assert from 'node:assert/strict'; import {realpathSync} from 'node:fs'; import {relative,isAbsolute,sep} from 'node:path'; import {prepareToolchain} from '@vooya/preset'; import {resolveToolchain} from '@vooya/build-core'; const [a,b]=await Promise.all([prepareToolchain(),prepareToolchain()]); assert.equal(realpathSync.native(a.cargoPath),realpathSync.native(b.cargoPath)); const t=resolveToolchain({cwd:process.cwd(),env:process.env}); assert.equal(t.cargoSelection,'managed'); assert.equal(realpathSync.native(t.cargo.path),realpathSync.native(a.cargoPath)); for(const path of [t.cargo.path,t.rustc.path,t.wasmBindgen.path]) {const inside=relative(realpathSync.native(process.env.VOOYA_CACHE_DIR),realpathSync.native(path)); assert.ok(inside!=='..'&&!inside.startsWith('..'+sep)&&!isAbsolute(inside));} assert.match(t.rustc.version,/1\\.94\\.0/); const explicit=resolveToolchain({cwd:process.cwd(),env:t.environment,mode:'system',cargoPath:t.cargo.path}); assert.equal(explicit.cargoSelection,'explicit'); console.log(JSON.stringify(t));`);
  function probeToolchain() {
    const probe = spawnSync(process.execPath, ["probe.mjs"], { cwd: app, env, encoding: "utf8" });
    assert.equal(probe.status, 0, probe.stderr);
    return JSON.parse(probe.stdout);
  }
  // Preserve the source-packed fresh concurrent installation check.
  const preparedToolchain = registry ? undefined : probeToolchain();
  // Registry acceptance starts with ordinary dev, before any prepare/doctor call.
  const url = await launch("dev", app, env, reusedCache ? 180_000 : 900_000);
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage();
  page.on("pageerror", error => { pageErrors.push(error.message); output += `\nBrowser error: ${error.message}`; });
  page.on("console", message => { if (message.type() === "error") output += `\nBrowser console: ${message.text()}`; });
  page.setDefaultTimeout(120_000);
  await page.goto(url);
  await page.getByRole("button", { name: "Count: 0", exact: true }).waitFor();
  await page.getByRole("button", { name: "Store: 0", exact: true }).click();
  await page.getByRole("button", { name: "Store: 1", exact: true }).waitFor();
  await page.getByRole("button", { name: "Count: 1", exact: true }).waitFor();
  const toolchain = preparedToolchain ?? probeToolchain();
  const doctor = JSON.parse(run(["run", "--silent", "doctor"], app, env));
  assert.equal(doctor.ok, true, JSON.stringify(doctor));
  assert.equal(doctor.schemaVersion, 1);
  assert.equal(doctor.cargo.selection, "managed");
  assert.equal(realpathSync.native(doctor.cargo.path), realpathSync.native(toolchain.cargo.path));
  for (const path of [doctor.cargo.path, doctor.rustc.path, doctor.wasmBindgen.path]) {
    const inside = relative(realpathSync.native(cacheDirectory), realpathSync.native(path));
    assert.ok(inside !== ".." && !inside.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && !isAbsolute(inside), "doctor tool must resolve inside the consumer cache");
  }
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
  assert.deepEqual(pageErrors, [], "development browser must not throw runtime errors");
  // Exercise the same ordinary build command while ambient Rust stays blocked.
  await browser.close(); browser = undefined;
  await stopServer();
  run(["run", "build"], app, env);
  const previewUrl = await launch("preview", app, env, 180_000);
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage();
  page.on("pageerror", error => { pageErrors.push(error.message); });
  await page.goto(previewUrl);
  await page.getByRole("button", { name: "Recovered: 0", exact: true }).waitFor();
  await page.getByRole("button", { name: "Store: 0", exact: true }).click();
  await page.getByRole("button", { name: "Recovered: 1", exact: true }).waitFor();
  assert.deepEqual(pageErrors, [], "production browser must not throw runtime errors");
  const evidence = { source: registry ? "registry" : "packed", versions: registry ? registryVersions : undefined, platform: process.platform, arch: process.arch, cache: reusedCache ? "reused-external-cache" : "fresh-cache", firstCommand: registry ? "npm run dev" : "concurrent prepareToolchain", ambientRust: "blocked commands; host SDK retained; not physically Rust-free", productionBrowser: true };
  console.log(JSON.stringify(evidence));
  if (process.env.VOOYA_PRESET_EVIDENCE_DIR) {
    mkdirSync(process.env.VOOYA_PRESET_EVIDENCE_DIR, { recursive: true });
    writeFileSync(join(process.env.VOOYA_PRESET_EVIDENCE_DIR, "result.json"), JSON.stringify(evidence, null, 2));
    copyFileSync(join(app, "package-lock.json"), join(process.env.VOOYA_PRESET_EVIDENCE_DIR, "package-lock.json"));
  }
  console.log(`Managed ${registry ? "registry" : "packed"} consumer passed (${process.platform}/${process.arch}): ordinary dev/browser Component+Store, Rust edit, compiler error/recovery, production build/browser, concurrent cache reuse and doctor; ambient Rust commands blocked, host SDK retained.`);
} catch (error) {
  if (page && !page.isClosed()) {
    try {
      console.error("Failed page:", await page.locator("body").innerText({ timeout: 1000 }));
      const screenshot = join(tmpdir(), `vooya-preset-failure-${Date.now()}.png`);
      await page.screenshot({ path: screenshot, timeout: 5000 });
      console.error(`Failure screenshot: ${screenshot}`);
    } catch (captureError) { console.error("Could not capture failed page:", captureError); }
  }
  if (output) console.error(output);
  throw error;
} finally {
  try { await browser?.close(); } finally {
    try { await stopServer(); } finally {
      rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  }
}
async function waitUntil(check, label, timeout = 180_000) {
  const deadline = Date.now() + timeout;
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

async function launch(command, app, env, timeout) {
  spawnError = undefined;
  const port = await availablePort();
  server = startDevServer(npm, ["run", command, "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: app, env, shell: process.platform === "win32", stdio: ["ignore", "pipe", "pipe"] });
  server.on("error", error => { spawnError = error; });
  server.stdout.on("data", data => { output += data; });
  server.stderr.on("data", data => { output += data; });
  const url = `http://127.0.0.1:${port}`;
  await waitUntil(async () => {
    if (spawnError) throw spawnError;
    assert.equal(server.exitCode, null, output);
    assert.equal(server.signalCode, null, output);
    let response;
    try { response = await fetch(url, { signal: AbortSignal.timeout(1000) }); }
    catch { return false; } // The listening socket may not exist yet.
    if (response.status >= 400 && response.status < 500) {
      const body = await response.text().catch(error => `<response body unavailable: ${error.message}>`);
      throw new Error(`Dev server startup returned HTTP ${response.status}: ${body}`);
    }
    return response.ok;
  }, `${command} server startup`, timeout);
  return url;
}
