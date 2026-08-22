import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const fixture = resolve(repositoryRoot, "tests/fixtures/rust-react");

run("npm", ["run", "build", "--workspace", "@vooya/build-core"], repositoryRoot);
run("npm", ["run", "build", "--workspace", "@vooya/vite"], repositoryRoot);
run("npm", ["run", "build", "--workspace", "@vooya/react"], repositoryRoot);
run(process.execPath, [resolve(repositoryRoot, "node_modules/vite/bin/vite.js"), "build", "--config", "vite.config.js"], fixture);

await verifyBrowser();
console.log("Verified Rust-file React component and store production behavior.");

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
    if (errors.length > 0) throw new Error(`Rust-file React fixture had browser errors:\n${errors.join("\n")}`);
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
