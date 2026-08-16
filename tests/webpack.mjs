import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("..", import.meta.url));
const temporaryRoot = mkdtempSync(resolve(tmpdir(), "vooya-webpack-"));

try {
  const vue = prepare("webpack-vue", "5.109.2");
  const react = prepare("webpack-react", "5.109.2");
  build(vue);
  build(react);
  assertWasm(vue);
  assertWasm(react);
  await browserVue(vue);
  await browserReact(react);

  const legacy = prepare("webpack-vue", "5.101.0");
  build(legacy);
  assertWasm(legacy);
  console.log("Webpack 5.109.2 Vue/React browser checks and 5.101.0 WASM build passed.");
} finally {
  if (!process.env.VOOYA_KEEP_WEBPACK_FIXTURE) rmSync(temporaryRoot, { force: true, recursive: true });
}

function prepare(name, webpackVersion) {
  const project = resolve(temporaryRoot, `${name}-${webpackVersion}`);
  cpSync(resolve(root, "tests/fixtures", name), project, {
    recursive: true,
    filter(path) { return !path.includes("node_modules") && !path.includes(".voo-cache") && !path.includes("/dist"); },
  });
  const manifestPath = resolve(project, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  for (const packageName of ["core", "compiler", "build-core", "vue", "react", "webpack"]) {
    const key = `@vooya/${packageName}`;
    if (manifest.dependencies[key]) manifest.dependencies[key] = `file:${resolve(root, "packages", packageName)}`;
  }
  manifest.dependencies.webpack = webpackVersion;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], project);
  return project;
}

function build(project) { run("npm", ["run", "build"], project); }
function assertWasm(project) {
  if (!readdirSync(resolve(project, "dist")).some((file) => file.endsWith(".wasm"))) {
    throw new Error(`Webpack did not emit a WASM asset for ${project}.`);
  }
}

async function browserVue(project) {
  await withPage(project, async (page) => {
    await page.locator("[data-count]").waitFor();
    if (await page.locator("[data-count]").textContent() !== "1") throw new Error("Vue island did not mount its initial prop.");
    if (await page.locator(".counter").evaluate((node) => getComputedStyle(node).color) !== "rgb(255, 0, 0)") throw new Error("Vue island scoped style was not applied.");
    await page.locator("#increment").click();
    if (await page.locator("#events").textContent() !== "9") throw new Error("Vue event forwarding failed.");
    await page.locator("#update").click();
    if (await page.locator("[data-count]").textContent() !== "2") throw new Error("Vue prop update failed.");
  });
}

async function browserReact(project) {
  await withPage(project, async (page) => {
    await page.locator("[data-count]").waitFor();
    if (await page.locator("[data-count]").textContent() !== "1") throw new Error("React island did not mount its initial prop.");
    if (await page.locator(".counter").evaluate((node) => getComputedStyle(node).color) !== "rgb(255, 0, 0)") throw new Error("React island scoped style was not applied.");
    await page.locator("#increment").click();
    if (await page.locator("#events").textContent() !== "9") throw new Error("React callback forwarding failed.");
    await page.locator("#update").click();
    if (await page.locator("[data-count]").textContent() !== "2") throw new Error("React prop update failed.");
    await page.locator("#toggle").click();
    await page.locator("[data-count]").waitFor({ state: "detached" });
  });
}

async function withPage(project, verify) {
  const port = await portNumber();
  const server = createServer((request, response) => {
    const pathname = request.url === "/" ? "/index.html" : request.url.split("?")[0];
    try {
      const body = readFileSync(resolve(project, "dist", `.${pathname}`));
      response.setHeader("Content-Type", pathname.endsWith(".wasm") ? "application/wasm" : pathname.endsWith(".js") ? "text/javascript" : "text/html");
      response.end(body);
    } catch { response.statusCode = 404; response.end("not found"); }
  });
  await new Promise((done) => server.listen(port, "127.0.0.1", done));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(`http://127.0.0.1:${port}`, { waitUntil: "domcontentloaded" });
    await verify(page);
    if (errors.length) throw new Error(`Webpack browser errors:\n${errors.join("\n")}`);
  } finally {
    await browser.close();
    await new Promise((done) => server.close(done));
  }
}

function portNumber() {
  return new Promise((done, fail) => {
    const probe = createNetServer();
    probe.once("error", fail);
    probe.listen(0, "127.0.0.1", () => { const { port } = probe.address(); probe.close(() => done(port)); });
  });
}
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}.`);
}
