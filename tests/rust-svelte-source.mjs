import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const fixture = resolve(repositoryRoot, "tests/fixtures/rust-svelte");

run("npm", ["run", "build", "--workspace", "@vooya/build-core"], repositoryRoot);
run("npm", ["run", "build", "--workspace", "@vooya/vite"], repositoryRoot);
run("npm", ["run", "build", "--workspace", "@vooya/svelte"], repositoryRoot);
run(process.execPath, [resolve(repositoryRoot, "node_modules/vite/bin/vite.js"), "build", "--config", "vite.config.js"], fixture);

verifyGeneratedDeclarations();
await verifyBrowser();
console.log("Verified Rust-file Svelte component and store production behavior.");

function verifyGeneratedDeclarations() {
  const component = readFileSync(resolve(fixture, ".vooya/types/src/Counter.d.rs.ts"), "utf8");
  const store = readFileSync(resolve(fixture, ".vooya/types/src/Store.d.rs.ts"), "utf8");
  assert.match(component, /import type \{ Component \} from "svelte"/);
  assert.match(component, /onSelected\?: \(value: number\) => void/);
  assert.match(store, /import type \{ Readable \} from "svelte\/store"/);
  assert.match(store, /state: Readable<CartSnapshot \| undefined>/);
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
    const errors = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Store 0" }).click();
    await page.getByRole("button", { name: "Store 1" }).waitFor();
    await page.getByRole("button", { name: "Count: 1" }).waitFor();
    await page.getByText("Selected 1").waitFor();
    await page.getByText("Component probe ready").waitFor();
    await page.getByText("Store probe ready").waitFor();
    await page.getByRole("button", { name: "Unmount probe" }).click();
    await page.waitForFunction(() => (
      window.__vooyaComponentDisposed === 1 && window.__vooyaStoreDisposed === 1
    ));
    if (errors.length > 0) throw new Error(`Rust-file Svelte fixture had browser errors:\n${errors.join("\n")}`);
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
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}.`);
}
