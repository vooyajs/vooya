import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const temporaryRoot = mkdtempSync(resolve(tmpdir(), "vooya-octane-"));
const fixture = resolve(temporaryRoot, "app");
const packs = resolve(temporaryRoot, "packages");

try {
  run("npm", ["run", "build:core"], repositoryRoot);
  run("npm", ["run", "build", "--workspace", "@vooya/vite"], repositoryRoot);
  run("npm", ["run", "build", "--workspace", "@vooya/octane"], repositoryRoot);
  mkdirSync(packs);
  cpSync(resolve(repositoryRoot, "tests/fixtures/rust-octane"), fixture, { recursive: true });
  const tarballs = ["core", "compiler", "build-core", "vite", "octane"].map((name) => {
    const packed = spawnSync("npm", ["pack", "--workspace", `@vooya/${name}`, "--json", "--pack-destination", packs], {
      cwd: repositoryRoot, encoding: "utf8", shell: process.platform === "win32",
    });
    if (packed.status !== 0) throw new Error(packed.stderr || packed.stdout);
    return resolve(packs, JSON.parse(packed.stdout)[0].filename);
  });
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", ...tarballs], fixture);
  run("npm", ["run", "build"], fixture);
  run("npm", ["run", "typecheck"], fixture);
  await verifyBrowser();
  console.log("Verified packed native Octane 0.9 / Vite 8 Rust components, stores, types and remount.");
} finally {
  if (!process.env.VOOYA_KEEP_OCTANE_FIXTURE) rmSync(temporaryRoot, { recursive: true, force: true });
  else console.log(`Octane fixture retained at ${fixture}`);
}

async function verifyBrowser() {
  const dist = resolve(fixture, "dist");
  const port = await availablePort();
  const server = createServer((request, response) => {
    const pathname = request.url === "/" ? "index.html" : (request.url ?? "/").slice(1);
    const file = resolve(dist, pathname);
    const path = relative(dist, file);
    if (isAbsolute(path) || path.startsWith("..")) {
      response.writeHead(403).end("forbidden");
      return;
    }
    try {
      const body = readFileSync(file);
      response.setHeader("Content-Type", contentType(file));
      response.end(body);
    } catch {
      response.writeHead(404).end("not found");
    }
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, "127.0.0.1", resolveListen);
  });

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(15_000);
    const errors = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Store A: 0", exact: true }).waitFor();
    await page.getByRole("button", { name: "Store B: 0", exact: true }).waitFor();
    await page.getByText("Tracked A: 0", { exact: true }).waitFor();
    await page.getByText("Tracked B: 0", { exact: true }).waitFor();
    for (const count of [1, 2]) {
      await page.getByRole("button", { name: `Store A: ${count - 1}`, exact: true }).click();
      await page.getByRole("button", { name: `Store A: ${count}`, exact: true }).waitFor();
      await page.locator('[data-panel="A"]').getByRole("button", { name: `Count: ${count}`, exact: true }).waitFor();
      await page.getByText(`Selected ${count} A,octane`, { exact: true }).waitFor();
      await page.getByRole("button", { name: "Store B: 0", exact: true }).waitFor();
    }
    const color = await page.locator('[data-panel="A"] [data-vooya-host] button').evaluate((node) => getComputedStyle(node).color);
    if (color !== "rgb(7, 101, 173)") throw new Error(`Rust component CSS was not applied: ${color}`);
    await page.getByRole("button", { name: "Hide", exact: true }).click();
    await page.getByText("Unmounted", { exact: true }).waitFor();
    if (await page.locator('[data-vooya-host]').count()) throw new Error("Component hosts survived unmount.");
    await page.waitForFunction(() => window.vooyaOctaneLifecycle.disposed === 2);
    const lifecycle = await page.evaluate(() => window.vooyaOctaneLifecycle);
    if (lifecycle.created !== 2 || lifecycle.unsubscribed !== 2 || lifecycle.disposed !== 2) {
      throw new Error(`Owned stores were not cleaned up: ${JSON.stringify(lifecycle)}`);
    }
    await page.getByRole("button", { name: "Show", exact: true }).click();
    await page.getByRole("button", { name: "Store A: 0", exact: true }).waitFor();
    await page.getByRole("button", { name: "Store B: 0", exact: true }).waitFor();
    await page.getByRole("button", { name: "Store B: 0", exact: true }).click();
    await page.getByRole("button", { name: "Store B: 1", exact: true }).waitFor();
    if (errors.length > 0) throw new Error(`Rust-file Octane fixture had browser errors:\n${errors.join("\n")}`);
  } finally {
    await browser.close();
    await new Promise((resolveClose) => server.close(resolveClose));
  }
}

function contentType(file) {
  if (file.endsWith(".js")) return "text/javascript";
  if (file.endsWith(".css")) return "text/css";
  if (file.endsWith(".wasm")) return "application/wasm";
  return "text/html";
}

function availablePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createNetServer();
    server.once("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? rejectPort(error) : resolvePort(port));
    });
  });
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}.`);
}
