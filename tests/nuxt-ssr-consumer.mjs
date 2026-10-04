import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("..", import.meta.url));
const temporary = mkdtempSync(resolve(tmpdir(), "vooya-nuxt-ssr-"));
let server, browser;
let serverOutput = "";
try {
  run("npm", ["run", "build:packages"], root);
  cpSync(resolve(root, "tests/fixtures/nuxt-ssr"), temporary, { recursive: true });
  const packs = resolve(temporary, "packs");
  mkdirSync(packs);
  const manifestPath = resolve(temporary, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  for (const name of ["compiler", "core", "build-core", "vite", "vue"]) {
    const output = run("npm", ["pack", "--pack-destination", packs, "--json"], resolve(root, "packages", name), true);
    manifest.dependencies[`@vooya/${name}`] = `file:${resolve(packs, JSON.parse(output)[0].filename)}`;
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], temporary);
  run("npm", ["run", "build"], temporary);

  const port = await availablePort();
  const url = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [resolve(temporary, ".output/server/index.mjs")], {
    cwd: temporary,
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => { serverOutput += chunk; });
  server.stderr.on("data", (chunk) => { serverOutput += chunk; });
  let serverError;
  server.on("error", (error) => { serverError = error; });
  const deadline = Date.now() + 30_000;
  while (true) {
    if (serverError) throw serverError;
    if (server.exitCode !== null) throw new Error(`Nuxt exited early:\n${serverOutput}`);
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) break; } catch {}
    if (Date.now() >= deadline) throw new Error(`Nuxt did not start:\n${serverOutput}`);
    await new Promise((done) => setTimeout(done, 100));
  }
  const pages = await Promise.all([fetch(url), fetch(url)].map(async (response) => {
    const result = await response;
    assert.equal(result.status, 200);
    return result.text();
  }));
  for (const html of pages) {
    assert.equal((html.match(/data-vooya-host/g) ?? []).length, 2);
    assert.equal((html.match(/Store pending/g) ?? []).length, 2);
    assert.ok(!html.includes("Count: 0"), "Rust DOM must not render on the server");
  }

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(30_000);
  const errors = [], wasmResponses = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) errors.push(message.text());
  });
  page.on("response", (response) => {
    if (new URL(response.url()).pathname.endsWith(".wasm")) {
      wasmResponses.push({ status: response.status(), type: response.headers()["content-type"] });
    }
  });
  await page.goto(url);
  const first = page.locator("#first");
  const second = page.locator("#second");
  await first.getByRole("button", { name: "Store 0", exact: true }).click();
  await first.getByRole("button", { name: "Count: 1", exact: true }).waitFor();
  await first.getByText("Selected 1", { exact: true }).waitFor();
  await second.getByRole("button", { name: "Store 0", exact: true }).waitFor();
  assert.equal(await first.locator(".counter").evaluate((node) => getComputedStyle(node).display), "flex");
  assert.ok(wasmResponses.some(({ status, type }) => status === 200 && type?.startsWith("application/wasm")));

  const before = await page.evaluate(() => ({
    components: globalThis.__vooyaComponentDisposals ?? 0,
    stores: globalThis.__vooyaStoreDisposals ?? 0,
  }));
  await page.evaluate(() => { globalThis.__vooyaNavigationMarker = true; });
  await page.getByRole("link", { name: "Away", exact: true }).click();
  await page.getByRole("heading", { name: "Away from counters" }).waitFor();
  await page.waitForFunction(({ components, stores }) =>
    globalThis.__vooyaComponentDisposals === components + 2 && globalThis.__vooyaStoreDisposals === stores + 2,
  before);
  await page.getByRole("link", { name: "Counters", exact: true }).click();
  await first.getByRole("button", { name: "Store 0", exact: true }).waitFor();
  await second.getByRole("button", { name: "Store 0", exact: true }).waitFor();
  assert.equal(await page.evaluate(() => globalThis.__vooyaNavigationMarker), true, "navigation must not reload the document");
  await first.getByRole("button", { name: "Store 0", exact: true }).click();
  await first.getByRole("button", { name: "Count: 1", exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log("Nuxt packed consumer passed production SSR, WASM delivery, isolated stores, props/events, CSS and route disposal/remount.");
} catch (error) {
  if (serverOutput) console.error(serverOutput);
  throw error;
} finally {
  if (browser) await browser.close();
  if (server && server.exitCode === null && server.pid) {
    const stopped = once(server, "exit");
    server.kill("SIGTERM");
    const force = setTimeout(() => server.kill("SIGKILL"), 5000);
    await stopped;
    clearTimeout(force);
  }
  if (process.env.VOOYA_KEEP_NUXT_FIXTURE) console.log(`Kept fixture: ${temporary}`);
  else rmSync(temporary, { recursive: true, force: true });
}

function availablePort() {
  return new Promise((done, reject) => {
    const socket = createServer();
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => {
      const port = socket.address().port;
      socket.close((error) => error ? reject(error) : done(port));
    });
  });
}

function run(command, args, cwd, capture = false) {
  return execFileSync(command, args, { cwd, encoding: "utf8", stdio: capture ? "pipe" : "inherit" });
}
