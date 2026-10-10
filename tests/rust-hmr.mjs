import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startDevServer, stopDevServer } from "./helpers/dev-server.mjs";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const fixture = resolve(repositoryRoot, "tests/fixtures/rust-vue");
const temporaryRoot = mkdtempSync(resolve(tmpdir(), "vooya-rust-hmr-"));
const project = process.env.VOOYA_RUST_FIXTURE_ROOT ?? resolve(temporaryRoot, "app");
const port = await availablePort();
const vite = resolve(process.env.VOOYA_RUST_FIXTURE_ROOT ?? repositoryRoot, process.env.VOOYA_VITE_PLUS ? "node_modules/vite-plus/bin/vp" : "node_modules/vite/bin/vite.js");
const framework = process.argv[2] ?? "vue";
let output = "";
let server;
let browser;
const originalSources = new Map();

try {
  if (!process.env.VOOYA_RUST_FIXTURE_ROOT) {
    cpSync(fixture, project, { recursive: true });
    symlinkSync(resolve(repositoryRoot, "node_modules"), resolve(project, "node_modules"), "dir");
  }
  const extension = { vue: "vue", react: "jsx", solid: "jsx", svelte: "svelte", octane: "tsx" }[framework];
  const hostPath = resolve(project, `src/App.${extension}`);
  const originalHost = readFileSync(hostPath, "utf8");
  originalSources.set(hostPath, originalHost);
  writeFileSync(hostPath, originalHost.replace('"./Counter.rs"', '"/src/Counter.rs"'));
  server = startDevServer(process.execPath, [vite, ...(process.env.VOOYA_VITE_PLUS ? ["dev"] : []), "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: project,
    env: { ...process.env, FORCE_COLOR: "0" },
  });
  server.stdout.on("data", collectOutput);
  server.stderr.on("data", collectOutput);
  await waitForServer(`http://127.0.0.1:${port}`);
  browser = await chromium.launch();
  const page = await browser.newPage();
  const unexpectedErrors = [];
  page.on("pageerror", (error) => unexpectedErrors.push(error.message));
  page.setDefaultTimeout(60_000);
  await page.goto(`http://127.0.0.1:${port}`);
  await page.getByRole("button", { name: "Count: 0" }).first().waitFor();

  if (framework === "vue" || framework === "octane") {
    const stylePath = resolve(project, "src/Counter.css");
    const style = readFileSync(stylePath, "utf8");
    originalSources.set(stylePath, style);
    writeFileSync(stylePath, `${style}\nbutton { outline: 7px solid rgb(12, 34, 56); }\n`);
    await page.waitForFunction(() => {
      const element = document.querySelector("[data-voo-scope] button");
      return element && getComputedStyle(element).outlineWidth === "7px";
    });
  }

  const componentPath = resolve(project, "src/Counter.rs");
  const source = readFileSync(componentPath, "utf8");
  originalSources.set(componentPath, source);
  writeFileSync(componentPath, source.replace("Count: {}", "HMR: {}"));
  await page.getByRole("button", { name: "HMR: 0" }).first().waitFor();

  writeFileSync(componentPath, source.replace("Count: {}", "{missing_value}: {}"));
  await waitFor(() => output.includes("Cargo build failed with exit code"));
  if (server.exitCode !== null) throw new Error("Rust-file HMR server exited after a failed build.");

  writeFileSync(componentPath, source.replace("Count: {}", "Recovered: {}"));
  await page.getByRole("button", { name: "Recovered: 0" }).first().waitFor();
  // Burst edits can arrive while a synchronous Rust build is still running.
  // The last saved source must eventually win without restarting the server.
  for (let revision = 0; revision < 5; revision++) {
    writeFileSync(componentPath, source.replace("Count: {}", `Rapid ${revision}: {}`));
    await new Promise((done) => setTimeout(done, 25));
  }
  await page.getByRole("button", { name: "Rapid 4: 0" }).first().waitFor();
  if (framework === "octane") await page.getByRole("button", { name: "Store A: 0", exact: true }).click();
  else await page.locator(".store-add").click();
  await page.getByRole("button", { name: "Rapid 4: 1" }).first().waitFor();
  const host = readFileSync(hostPath, "utf8");
  writeFileSync(hostPath, host.replace("Selected ", "Host updated "));
  await page.getByText(/^Host updated /).first().waitFor();
  if (unexpectedErrors.length) throw new Error(`Unexpected browser errors: ${unexpectedErrors.join("\n")}`);
  console.log(`Verified ${framework} Rust-file HMR rebuild, failure recovery, rapid-save coalescing, host edits, and full reload.`);
} finally {
  try {
    await browser?.close();
  } finally {
    try {
      await stopDevServer(server);
      // stopDevServer also kills Vite+ descendants. Wait for the child's pipes
      // to close before restoring source or deleting its working directory.
      if (server && server.exitCode === null && server.signalCode === null) {
        await new Promise((resolveClose, rejectClose) => {
          const timer = setTimeout(() => rejectClose(new Error("Development server did not exit after cleanup.")), 5000);
          server.once("close", () => { clearTimeout(timer); resolveClose(); });
        });
      }
    } finally {
      try {
        for (const [path, source] of originalSources) writeFileSync(path, source);
      } finally {
        rmSync(temporaryRoot, { force: true, recursive: true });
      }
    }
  }
}

function collectOutput(chunk) {
  output += chunk.toString();
}

async function waitForServer(url) {
  await waitFor(async () => {
    try { return (await fetch(url)).ok; } catch { return false; }
  }, 90_000);
}

async function waitFor(predicate, timeout = 90_000) {
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
