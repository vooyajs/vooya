import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const fixture = resolve(repositoryRoot, "tests/fixtures/rust-vue");

run("npm", ["run", "build", "--workspace", "@vooya/build-core"], repositoryRoot);
run("npm", ["run", "build", "--workspace", "@vooya/vite"], repositoryRoot);
run("npm", ["run", "build", "--workspace", "@vooya/vue"], repositoryRoot);
run(process.execPath, [resolve(repositoryRoot, "node_modules/vite/bin/vite.js"), "build", "--config", "vite.config.js"], fixture);

await verifyBrowser();
console.log("Verified Rust-file Vue component and store production behavior.");

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
      response.setHeader(
        "Content-Type",
        file.endsWith(".wasm")
          ? "application/wasm"
          : file.endsWith(".js")
            ? "text/javascript"
            : file.endsWith(".css")
              ? "text/css"
              : "text/html",
      );
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
    await page.getByRole("button", { name: /ABI 3 9007199254740993 none 7 2/ }).waitFor();
    await page.getByText("ABI payload 9007199254740993").waitFor();
    const counter = page.getByRole("button", { name: "Count: 1" });
    await counter.waitFor();
    await page.getByText("Selected 1").waitFor();
    if (await counter.evaluate((element) => getComputedStyle(element).display) !== "flex") {
      throw new Error("Rust-file scoped CSS was not applied to the component root.");
    }
    if (errors.length > 0) throw new Error(`Rust-file Vue fixture had browser errors:\n${errors.join("\n")}`);
  } finally {
    await browser.close();
    await new Promise((resolveClose) => server.close(resolveClose));
  }
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
