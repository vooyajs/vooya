import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repository = fileURLToPath(new URL("..", import.meta.url));
const root = mkdtempSync(resolve(tmpdir(), "vooya-isolated-artifacts-"));
const project = resolve(root, "app");
const packages = resolve(root, "packages");
let server;
let browser;
let output = "";
try {
  mkdirSync(packages);
  for (const script of ["build:core"]) run("npm", ["run", script], repository);
  for (const workspace of ["@vooya/vite", "@vooya/vue"]) run("npm", ["run", "build", "--workspace", workspace], repository);
  const tarballs = ["compiler", "core", "provider-rust", "build-core", "vite", "vue"].map(name => {
    const packed = spawnSync("npm", ["pack", "--json", "--workspace", `@vooya/${name}`, "--pack-destination", packages], {cwd: repository, encoding: "utf8", shell: process.platform === "win32"});
    assert.equal(packed.status, 0, packed.stderr);
    return resolve(packages, JSON.parse(packed.stdout)[0].filename);
  });
  cpSync(resolve(repository, "tests/fixtures/rust-artifacts"), project, {recursive: true, filter: path => !/(?:^|[/\\])(?:node_modules|dist|\.vooya)(?:[/\\]|$)/.test(path)});
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", ...tarballs], project);
  run("npm", ["run", "build"], project);
  run("npm", ["run", "typecheck"], project);
  const manifest = JSON.parse(readFileSync(resolve(project, "dist/vooya-artifacts.json"), "utf8"));
  assert.equal(manifest.artifacts.length, 2);
  const light = manifest.artifacts.find(item => item.id === "light");
  const heavy = manifest.artifacts.find(item => item.id === "heavy");
  assert.equal(light.wasm.length, 1);
  assert.equal(heavy.wasm.length, 1);
  assert.notEqual(light.wasm[0], heavy.wasm[0]);
  assert.ok(heavy.wasmBytes > light.wasmBytes);
  const entry = manifest.chunks.find(chunk => chunk.entry);
  for (const artifact of [light, heavy]) assert.ok(entry.dynamicImports.includes(artifact.chunks[0]));
  assert.doesNotMatch(readFileSync(resolve(project, ".vooya/artifacts/light/build/Cargo.toml"), "utf8"), /bevy_ecs/);
  assert.match(readFileSync(resolve(project, ".vooya/artifacts/heavy/build/Cargo.toml"), "utf8"), /bevy_ecs/);

  const vite = resolve(project, "node_modules/vite/bin/vite.js");
  await start([vite, "preview", "--host", "127.0.0.1", "--port", "0"]);
  browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__wasmInitializations = 0;
    for (const name of ["instantiate", "instantiateStreaming"]) {
      const original = WebAssembly[name];
      WebAssembly[name] = async (...args) => {
        const result = await original(...args);
        window.__wasmInitializations++;
        return result;
      };
    }
  });
  const requests = [];
  page.on("request", request => { if (request.url().includes(".wasm")) requests.push(request.url()); });
  await page.goto(url());
  await state(page, "light:0:0:0");
  assert.equal(requests.length, 1);
  assert.ok(requests[0].endsWith(light.wasm[0]));
  assert.equal(await page.evaluate(() => window.__wasmInitializations), 1);
  await page.getByRole("button", {name:"Add", exact:true}).click();
  await state(page, "light:1:1:0");
  await page.getByRole("button", {name:"Heavy route"}).click();
  await state(page, "heavy:0:0:1");
  assert.equal(requests.length, 2);
  assert.ok(requests[1].endsWith(heavy.wasm[0]));
  assert.equal(await page.evaluate(() => window.__wasmInitializations), 2);
  await page.getByRole("button", {name:"Add", exact:true}).click();
  await state(page, "heavy:1:1:1");
  await page.getByRole("button", {name:"Light route"}).click();
  await state(page, "light:0:0:2");
  await page.getByRole("button", {name:"Heavy route"}).click();
  await state(page, "heavy:0:0:3");
  assert.equal(requests.length, 2);
  assert.equal(await page.evaluate(() => window.__wasmInitializations), 2);
  assert.equal(await page.locator("#error").textContent(), "");
  assert.deepEqual(errors, []);
  await page.close();
  await stop();

  await start([vite, "--host", "127.0.0.1", "--port", "0"]);
  const dev = await browser.newPage();
  await dev.goto(url());
  await state(dev, "light:0:0:0");
  const wasmTime = id => statSync(resolve(project, `.vooya/artifacts/${id}/wasm/vooya_app_bg.wasm`), {bigint:true}).mtimeNs;
  const lightBefore = wasmTime("light");
  const heavyBefore = wasmTime("heavy");
  const lightFile = resolve(project, "src/light/Counter.rs");
  const heavyFile = resolve(project, "src/heavy/Counter.rs");
  const lightSource = readFileSync(lightFile, "utf8");
  const heavySource = readFileSync(heavyFile, "utf8");
  let navigations = 0;
  dev.on("framenavigated", frame => { if (frame === dev.mainFrame()) navigations++; });
  writeFileSync(lightFile, lightSource.replace("self.count += 1", "self.count += 2"));
  await wait(() => wasmTime("light") !== lightBefore && navigations > 0);
  await state(dev, "light:0:0:0");
  await dev.getByRole("button", {name:"Add", exact:true}).click();
  await state(dev, "light:2:1:0");
  assert.equal(wasmTime("heavy"), heavyBefore, "light edit rebuilt heavy Cargo unit");
  const lightAfter = wasmTime("light");
  const failureStart = output.length;
  writeFileSync(heavyFile, heavySource + "\nthis is invalid Rust\n");
  await wait(() => output.slice(failureStart).includes("Cargo build failed"));
  assert.ok(output.slice(failureStart).includes(heavyFile), "diagnostic did not map to authored heavy source");
  assert.equal(wasmTime("heavy"), heavyBefore, "failed unit replaced last good WASM");
  assert.equal(wasmTime("light"), lightAfter);
  const recoveryNav = navigations;
  writeFileSync(heavyFile, heavySource.replace('"bevy".into()', '"bevy recovered".into()'));
  await wait(() => wasmTime("heavy") !== heavyBefore && navigations > recoveryNav);
  await state(dev, "light:0:0:0");
  assert.equal(wasmTime("light"), lightAfter, "heavy recovery rebuilt light Cargo unit");
  await dev.getByRole("button", {name:"Heavy route"}).click();
  await state(dev, "heavy:0:0:1");
  await dev.getByRole("button", {name:"Add", exact:true}).click();
  await state(dev, "heavy:1:1:1");
  console.log("Verified packed isolated Rust artifacts: lazy fetch/initialization, independent types/Cargo, lifecycle, targeted rebuilds, diagnostics and recovery.");
} finally {
  await browser?.close();
  await stop();
  if (!process.env.VOOYA_KEEP_ARTIFACT_FIXTURE) rmSync(root, {recursive:true, force:true});
  else console.log(`Kept artifact fixture: ${project}`);
}
function run(command, args, cwd) {
  const result = spawnSync(command, args, {cwd, stdio:"inherit", shell: process.platform === "win32"});
  if (result.error || result.status !== 0) throw result.error ?? new Error(`${command} failed with ${result.status}`);
}
async function start(args) {
  output = "";
  server = spawn(process.execPath, args, {cwd:project, env:{...process.env, FORCE_COLOR:"0"}});
  server.stdout.on("data", data => output += data);
  server.stderr.on("data", data => output += data);
  await wait(() => /http:\/\/127\.0\.0\.1:\d+/.test(output));
}
function url() { return output.match(/http:\/\/127\.0\.0\.1:\d+/)[0]; }
async function state(page, expected) {
  try { await page.waitForFunction(value => document.querySelector("#state")?.textContent === value, expected, {timeout:30000}); }
  catch (cause) { throw new Error(`Expected ${expected}; page: ${await page.locator("body").innerText()}\n${output}`, {cause}); }
}
async function wait(check) {
  const until = Date.now() + 120000;
  while (Date.now() < until) {
    if (check()) return;
    if (server?.exitCode !== null) throw new Error(`Server exited:\n${output}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out:\n${output}`);
}
async function stop() {
  if (!server || server.exitCode !== null) return;
  const current = server;
  await new Promise(resolve => {
    const timeout = setTimeout(() => current.kill("SIGKILL"), 5000);
    current.once("exit", () => { clearTimeout(timeout); resolve(); });
    current.kill("SIGTERM");
  });
  server = undefined;
}
