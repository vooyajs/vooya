import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const fixture = resolve(repositoryRoot, "tests/fixtures/rust-vue");
const temporaryRoot = mkdtempSync(resolve(tmpdir(), "vooya-rust-hmr-"));
const project = resolve(temporaryRoot, "app");
const port = await availablePort();
const vite = resolve(repositoryRoot, "node_modules/vite/bin/vite.js");
let output = "";
let server;
let browser;

try {
  cpSync(fixture, project, { recursive: true });
  symlinkSync(resolve(repositoryRoot, "node_modules"), resolve(project, "node_modules"), "dir");
  server = spawn(process.execPath, [vite, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: project,
    env: { ...process.env, FORCE_COLOR: "0" },
  });
  server.stdout.on("data", collectOutput);
  server.stderr.on("data", collectOutput);
  await waitForServer(`http://127.0.0.1:${port}`);
  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}`);
  await page.getByRole("button", { name: "Count: 0" }).waitFor();

  const componentPath = resolve(project, "src/Counter.rs");
  const source = readFileSync(componentPath, "utf8");
  writeFileSync(componentPath, source.replace("Count: {}", "HMR: {}"));
  await page.getByRole("button", { name: "HMR: 0" }).waitFor();

  writeFileSync(componentPath, source.replace("Count: {}", "{missing_value}: {}"));
  await waitFor(() => output.includes("Cargo build failed with exit code"));
  if (server.exitCode !== null) throw new Error("Rust-file HMR server exited after a failed build.");

  writeFileSync(componentPath, source.replace("Count: {}", "Recovered: {}"));
  await page.getByRole("button", { name: "Recovered: 0" }).waitFor();
  console.log("Verified Rust-file HMR rebuild, failure recovery, and full reload.");
} finally {
  await browser?.close();
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await new Promise((resolveClose) => server.once("close", resolveClose));
  }
  rmSync(temporaryRoot, { force: true, recursive: true });
}

function collectOutput(chunk) {
  output += chunk.toString();
}

async function waitForServer(url) {
  await waitFor(async () => {
    try { return (await fetch(url)).ok; } catch { return false; }
  }, 30_000);
}

async function waitFor(predicate, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 75));
  }
  throw new Error(`Timed out waiting for Rust-file HMR state.\n${output}`);
}

function availablePort() {
  return new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() => resolvePort(address.port));
    });
  });
}
