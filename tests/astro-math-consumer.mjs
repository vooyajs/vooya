import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = resolve(root, "examples/math-plot-astro");
const temporary = mkdtempSync(resolve(tmpdir(), "vooya-astro-math-"));
const packs = resolve(temporary, "packs");
mkdirSync(packs);
let runningAstro;

try {
  run("npm", ["run", "build:packages"], root);
  const packages = ["compiler", "build-core", "core", "vite", "vue"];
  const tarballs = Object.fromEntries(packages.map((name) => [name, pack(resolve(root, "packages", name), packs)]));
  cpSync(source, temporary, {
    recursive: true,
    filter(path) {
      const relative = path.slice(source.length).replace(/^[/\\]/, "");
      return !new Set(["node_modules", "dist", ".astro", ".vooya"]).has(relative.split(sep)[0]);
    },
  });
  const manifestPath = resolve(temporary, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  for (const name of packages) manifest.dependencies[`@vooya/${name}`] = `file:${tarballs[name]}`;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], temporary);

  const devPort = await availablePort();
  runningAstro = { command: "dev", port: devPort };
  astro(["dev", "--background", "--host", "127.0.0.1", "--port", String(devPort)]);
  await waitForServer(devPort);
  await verifyBrowser(devPort);
  await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  let logs = astro(["dev", "logs"], true);
  let builds = logs.match(/Vooya: building Rust\/WASM source/g)?.length ?? 0;
  if (builds !== 1) throw new Error(`expected one stable dev build, observed ${builds}\n${logs}`);
  await verifyDependencyHmr(devPort);
  await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  logs = astro(["dev", "logs"], true);
  builds = logs.match(/Vooya: building Rust\/WASM source/g)?.length ?? 0;
  if (builds !== 2) throw new Error(`expected one dependency HMR rebuild without a loop, observed ${builds}\n${logs}`);
  astro(["dev", "stop"]);
  runningAstro = undefined;

  verifyMappedDependencyDiagnostic();

  // This exact order reproduces the Astro multi-environment alpha.11 failure:
  // check builds the Rust artifact once; build must not race a second cleanup.
  run("npx", ["astro", "check"], temporary);
  run("npm", ["run", "build"], temporary);

  const html = readFileSync(resolve(temporary, "dist/index.html"), "utf8");
  if (!html.includes("Static fallback: y = 1.25x + 0.5")) throw new Error("missing readable static fallback");
  if (html.includes("data-math-plot")) throw new Error("browser-only Rust DOM executed during prerender");
  const assets = readdirSync(resolve(temporary, "dist/_astro"));
  if (!assets.some((file) => file.endsWith(".wasm"))) throw new Error("Astro build did not emit WASM");
  if (!existsSync(resolve(temporary, ".vooya/types/src/MathPlot.d.rs.ts"))) throw new Error("missing generated Math Plot declaration");
  if (!existsSync(resolve(temporary, ".vooya/types/src/components/math/NestedProof.d.rs.ts"))) throw new Error("missing generated nested component declaration");
  const previewPort = await availablePort();
  runningAstro = { command: "preview", port: previewPort };
  astro(["preview", "--background", "--host", "127.0.0.1", "--port", String(previewPort)]);
  await waitForServer(previewPort);
  await verifyBrowser(previewPort);
  astro(["preview", "stop"]);
  runningAstro = undefined;
  console.log(`Clean Astro consumer passed dev mount, check → build, and production preview with ${packages.length} packed Vooya packages.`);
} finally {
  if (runningAstro) {
    try { astro([runningAstro.command, "stop"]); } catch {}
  }
  if (process.env.VOOYA_KEEP_ASTRO_MATH_FIXTURE) console.log(`Kept fixture: ${temporary}`);
  else rmSync(temporary, { recursive: true, force: true });
}

function verifyMappedDependencyDiagnostic() {
  const dependency = resolve(temporary, "src/MathPlot/series.rs");
  const source = readFileSync(dependency, "utf8");
  writeFileSync(dependency, source.replace("requested.clamp(16, 4096)", "requested.not_a_real_method(16, 4096)"));
  const result = spawnSync(process.execPath, [resolve(temporary, "node_modules/astro/bin/astro.mjs"), "check"], {
    cwd: temporary,
    encoding: "utf8",
  });
  writeFileSync(dependency, source);
  if (result.status === 0) throw new Error("invalid dependency module unexpectedly passed astro check");
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (!output.includes(`${dependency}:2:15`)) {
    throw new Error(`dependency diagnostic did not map to authored source:\n${output}`);
  }
  if (output.includes(".vooya/build/src/rust/src/MathPlot/series.rs:2:15")) {
    throw new Error(`dependency diagnostic leaked generated source path:\n${output}`);
  }
}

function astro(args, capture = false) {
  return run(process.execPath, [resolve(temporary, "node_modules/astro/bin/astro.mjs"), ...args], temporary, capture);
}

async function verifyBrowser(port) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
    const plot = page.locator("[data-math-plot]");
    await plot.waitFor();
    await page.locator("[data-nested-proof]", { hasText: "Nested Rust module ready" }).waitFor();
    const canvas = page.locator("canvas");
    await canvas.evaluate((node) => { window.__vooyaMathCanvas = node; });
    await page.locator("[data-weight]").press("ArrowRight");
    await page.waitForFunction(() => document.querySelector("[data-math-plot]")?.getAttribute("data-spec-revision") === "1");
    await page.waitForFunction(() => document.querySelector(".vooya-math-title")?.textContent?.includes("1.30"));
    if (!await canvas.evaluate((node) => window.__vooyaMathCanvas === node)) throw new Error("props update replaced the Canvas node");
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    const x = box.x + 56 + 0.5 * (box.width - 86);
    const y = box.y + 22 + ((7 - 0.7) / 12) * (box.height - 68);
    await page.mouse.move(x, y);
    await page.waitForFunction(() => document.querySelector("[data-probe]")?.textContent?.includes("series_id"));
    await page.setViewportSize({ width: 320, height: 700 });
    await page.waitForFunction(() => window.innerWidth === 320);
    const mobileBox = await canvas.boundingBox();
    if (mobileBox.width >= 320) throw new Error(`expected a sub-320px responsive Canvas, observed ${mobileBox.width}px`);
    const logicalWidth = Math.max(mobileBox.width, 320);
    const logicalHeight = Math.max(mobileBox.height, 240);
    const mobileX = mobileBox.x + (56 + ((4 - -6) / 12) * (logicalWidth - 86)) * mobileBox.width / logicalWidth;
    const mobileY = mobileBox.y + (22 + ((7 - 5.7) / 12) * (logicalHeight - 68)) * mobileBox.height / logicalHeight;
    await page.mouse.move(mobileX, mobileY);
    await page.waitForFunction(() => document.querySelector("[data-probe]")?.textContent?.includes('"series_id":"training"'));
    await page.setViewportSize({ width: 1100, height: 900 });
    await canvas.hover();
    const before = await plot.getAttribute("data-viewport");
    await page.mouse.wheel(0, -180);
    await page.waitForFunction((value) => document.querySelector("[data-math-plot]")?.getAttribute("data-viewport") !== value, before);
    await canvas.focus();
    await canvas.press("ArrowRight");
    const size = await canvas.evaluate((node) => ({ css: node.getBoundingClientRect().width, bitmap: node.width, dpr: devicePixelRatio }));
    if (size.bitmap < size.css * size.dpr - 1) throw new Error(`Canvas is not HiDPI responsive: ${JSON.stringify(size)}`);
    const mounts = Number(await page.evaluate(() => sessionStorage.getItem("__vooyaMathMounts") ?? 0));
    const disposes = Number(await page.evaluate(() => sessionStorage.getItem("__vooyaMathDisposes") ?? 0));
    await page.locator("[data-toggle]").click();
    await plot.waitFor({ state: "detached" });
    const nextDisposes = Number(await page.evaluate(() => sessionStorage.getItem("__vooyaMathDisposes") ?? 0));
    if (nextDisposes !== disposes + 1 || mounts < 1) throw new Error("component dispose lifecycle did not run");
    if (errors.length) throw new Error(`browser errors:\n${errors.join("\n")}`);
  } finally {
    await browser.close();
  }
}

async function verifyDependencyHmr(port) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
    await page.locator("[data-math-plot]").waitFor();
    const dependency = resolve(temporary, "src/MathPlot/spec.rs");
    const source = readFileSync(dependency, "utf8");
    writeFileSync(dependency, source.replace("spec v1", "spec v1 dependency-hmr"));
    await page.waitForFunction(() => document.querySelector(".vooya-math-status")?.textContent?.includes("dependency-hmr"));
  } finally {
    await browser.close();
  }
}

async function waitForServer(port) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) return; } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Astro server on ${port} did not start`);
}

function availablePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.once("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => error ? rejectPort(error) : resolvePort(address.port));
    });
  });
}

function pack(directory, destination) {
  const output = run("npm", ["pack", "--pack-destination", destination, "--json"], directory, true);
  return resolve(destination, JSON.parse(output)[0].filename);
}

function run(command, args, cwd, capture = false) {
  return execFileSync(command, args, { cwd, encoding: "utf8", stdio: capture ? "pipe" : "inherit" });
}
