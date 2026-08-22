import { spawn, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const root = fileURLToPath(new URL("..", import.meta.url));
const temporaryRoot = mkdtempSync(resolve(tmpdir(), "vooya-webpack-source-"));
const packageDirectory = resolve(temporaryRoot, "packages");

try {
  mkdirSync(packageDirectory, { recursive: true });
  const packages = [
    "@vooya/compiler",
    "@vooya/core",
    "@vooya/build-core",
    "@vooya/vue",
    "@vooya/react",
    "@vooya/webpack",
  ].map(pack);

  const vue = prepare("webpack-vue", "5.109.2", packages);
  const react = prepare("webpack-react", "5.109.2", packages);
  buildAndInspect(vue, "webpack-vue");
  buildAndInspect(react, "webpack-react");
  await verifyVueBrowser(vue);
  await verifyReactBrowser(react);
  await verifyDevRecovery(vue);

  const olderFixture = prepare("webpack-vue", "5.101.0", packages);
  buildAndInspect(olderFixture, "webpack-vue-5.101.0");
  console.log("Verified Webpack 5.109.2 Vue/React and Webpack 5.101.0 Vue source builds.");
} finally {
  if (!process.env.VOOYA_KEEP_WEBPACK_FIXTURES) {
    rmSync(temporaryRoot, { force: true, recursive: true });
  }
}

function prepare(name, webpackVersion, packages) {
  const project = resolve(temporaryRoot, `${name}-${webpackVersion}`);
  cpSync(resolve(root, "tests/fixtures", name), project, { recursive: true });
  const manifestPath = resolve(project, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.devDependencies.webpack = webpackVersion;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", ...packages], project);
  return project;
}

function buildAndInspect(project, name) {
  run("npm", ["run", "build"], project);
  const output = walk(resolve(project, "dist"));
  if (!output.some((path) => path.endsWith(".wasm"))) {
    throw new Error(`${name} did not emit a WASM asset.`);
  }
  const typesRoot = resolve(project, ".vooya/types");
  if (!existsSync(typesRoot) || !walk(typesRoot).some((path) => path.endsWith(".d.voo.ts"))) {
    throw new Error(`${name} did not generate declarations under .vooya/types.`);
  }
  if (walk(resolve(project, "src")).some((path) => path.endsWith(".d.voo.ts"))) {
    throw new Error(`${name} wrote generated declarations beside a source .voo file.`);
  }
  if (!existsSync(resolve(project, ".vooya/metadata.json"))) {
    throw new Error(`${name} did not write Vooya workspace metadata.`);
  }
  console.log(`Verified ${name} production output and centralized declarations.`);
}

async function verifyVueBrowser(project) {
  await withProductionPage(project, async (page) => {
    await verifyCommonBrowserContract(page, "Webpack Vue");
  });
}

async function verifyReactBrowser(project) {
  await withProductionPage(project, async (page) => {
    await verifyCommonBrowserContract(page, "Webpack React");
  });
}

async function verifyCommonBrowserContract(page, label) {
  await page.getByRole("button", { name: "Increment" }).waitFor();
  await waitForText(page, "[data-count]", "2", `${label} island did not mount.`);
  const color = await page.locator(".counter").evaluate((node) => getComputedStyle(node).color);
  if (color !== "rgb(5, 103, 89)") throw new Error(`${label} scoped style was not applied.`);
  await page.locator("[data-inc]").click();
  await waitForText(page, "[data-event]", "3", `${label} event forwarding failed.`);
  await page.locator("[data-host-update]").click();
  await waitForText(page, "[data-count]", "4", `${label} prop update failed.`);
  await page.locator("[data-host-toggle]").click();
  await page.locator("[data-count]").waitFor({ state: "detached" });
  await page.locator("[data-host-toggle]").click();
  await waitForText(page, "[data-count]", "4", `${label} dispose/remount failed.`);
}

async function verifyDevRecovery(project) {
  const port = await availablePort();
  const cli = resolve(project, "node_modules/webpack-cli/bin/cli.js");
  let output = "";
  let browser;
  let server;
  try {
    server = spawn(
      process.execPath,
      [cli, "serve", "--mode", "development", "--host", "127.0.0.1", "--port", String(port)],
      { cwd: project, env: { ...process.env, FORCE_COLOR: "0" } },
    );
    server.stdout.on("data", (chunk) => { output += chunk; });
    server.stderr.on("data", (chunk) => { output += chunk; });
    await waitFor(async () => (await fetch(`http://127.0.0.1:${port}`)).ok, 120_000, () => output);

    browser = await chromium.launch();
    const page = await browser.newPage();
    const errors = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}`);
    await page.getByRole("button", { name: "Increment" }).waitFor();

    const componentPath = resolve(project, "src/Counter.voo");
    const source = readFileSync(componentPath, "utf8");
    const successesBeforeFailure = successfulBuildCount(output);
    writeFileSync(
      componentPath,
      source.replace(
        "use crate::{EventListener, View, ViewElement};",
        "use crate::{EventListener, View, ViewElement};\nthis is invalid Rust",
      ),
    );
    await waitFor(
      () => plainOutput(output).includes("Cargo build failed with exit code 101"),
      60_000,
      () => output,
    );
    if (!/Counter\.voo:\d+/.test(plainOutput(output))) {
      throw new Error(`Webpack did not retain the mapped .voo Rust diagnostic.\n${output}`);
    }
    if (server.exitCode !== null) throw new Error("Webpack Dev Server exited after a Rust failure.");

    writeFileSync(componentPath, source);
    await waitFor(
      () => successfulBuildCount(output) > successesBeforeFailure,
      60_000,
      () => `Webpack did not recover after fixing Rust.\n${output}`,
    );
    await waitForButton(page, "Increment", output, errors, "Webpack did not remount after Rust recovery.");

    const dependencyPath = resolve(project, "rust/counter-math/src/lib.rs");
    const successesBeforeDependency = successfulBuildCount(output);
    writeFileSync(
      dependencyPath,
      `pub fn button_label() -> &'static str {\n    "Increment dependency"\n}\n`,
    );
    await waitFor(
      () => successfulBuildCount(output) > successesBeforeDependency,
      60_000,
      () => `Webpack did not rebuild after the path dependency changed.\n${output}`,
    );
    await waitForButton(page, "Increment dependency", output, errors, "Webpack did not expose the rebuilt path dependency.");

    const successesBeforeRapidSave = successfulBuildCount(output);
    writeFileSync(
      dependencyPath,
      `pub fn button_label() -> &'static str {\n    "Increment first"\n}\n`,
    );
    writeFileSync(
      dependencyPath,
      `pub fn button_label() -> &'static str {\n    "Increment final"\n}\n`,
    );
    await waitFor(
      () => successfulBuildCount(output) > successesBeforeRapidSave,
      60_000,
      () => `Webpack did not rebuild after rapid dependency saves.\n${output}`,
    );
    await waitForButton(page, "Increment final", output, errors, "Webpack did not expose the final rapid-save result.");

    const unexpected = errors.filter(
      (message) =>
        !message.includes("Cargo build failed with exit code 101") &&
        !message.includes("[webpack-dev-server] Errors while compiling. Reload prevented."),
    );
    if (unexpected.length) {
      throw new Error(`Webpack development browser errors:\n${unexpected.join("\n")}`);
    }
    console.log("Verified Webpack Rust failure recovery, path dependency watch, and rapid saves.");
  } finally {
    await browser?.close();
    if (server?.exitCode === null) server.kill("SIGTERM");
  }
}

async function withProductionPage(project, verify) {
  const port = await availablePort();
  const server = createHttpServer((request, response) => {
    const url = request.url === "/" ? "/index.html" : request.url.split("?")[0];
    try {
      const body = readFileSync(resolve(project, "dist", `.${url}`));
      response.setHeader(
        "Content-Type",
        url.endsWith(".wasm")
          ? "application/wasm"
          : url.endsWith(".js")
            ? "text/javascript"
            : "text/html",
      );
      response.end(body);
    } catch {
      response.statusCode = 404;
      response.end("not found");
    }
  });
  await new Promise((done) => server.listen(port, "127.0.0.1", done));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(`http://127.0.0.1:${port}`);
    await verify(page);
    if (errors.length) throw new Error(`Webpack production browser errors:\n${errors.join("\n")}`);
  } finally {
    await browser.close();
    await new Promise((done) => server.close(done));
  }
}

function pack(workspace) {
  const result = spawnSync(
    "npm",
    ["pack", "--json", "--workspace", workspace, "--pack-destination", packageDirectory],
    { cwd: root, encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return resolve(packageDirectory, JSON.parse(result.stdout)[0].filename);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}.`);
  }
}

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

async function waitForText(page, selector, expected, message) {
  try {
    await page.waitForFunction(
      ({ selector: target, expected: value }) => document.querySelector(target)?.textContent === value,
      { selector, expected },
      { timeout: 30_000 },
    );
  } catch {
    throw new Error(`${message} Received ${JSON.stringify(await page.locator(selector).textContent())}.`);
  }
}

async function waitForButton(page, name, output, errors, message) {
  try {
    await page.getByRole("button", { name }).waitFor({ timeout: 60_000 });
  } catch (cause) {
    const screenshot = resolve(tmpdir(), `vooya-webpack-recovery-${Date.now()}.png`);
    await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
    const body = await page.locator("body").innerText().catch(() => "<body unavailable>");
    const detail = [
      message,
      `URL: ${page.url()}`,
      `Screenshot: ${screenshot}`,
      `Page errors:\n${errors.join("\n") || "<none>"}`,
      `Body:\n${body.slice(0, 4000)}`,
      `Webpack output:\n${plainOutput(output).slice(-8000)}`,
    ].join("\n\n");
    throw new Error(detail, { cause });
  }
}

async function waitFor(predicate, timeout = 30_000, details = () => "") {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      if (await predicate()) return;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`Timed out waiting for Webpack.\n${details()}`);
}

function availablePort() {
  return new Promise((resolvePort, reject) => {
    const probe = createNetServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() => resolvePort(address.port));
    });
  });
}

function successfulBuildCount(output) {
  return plainOutput(output).match(/compiled successfully/g)?.length ?? 0;
}

function plainOutput(output) {
  return output.replace(/\u001b\[[0-?]*[ -\/]*[@-~]/g, "");
}
