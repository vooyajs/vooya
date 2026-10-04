import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { candidatePackages, consumerPackages, parseRegistryArguments, registryPackages, verifyPackedLockfile, verifyPackedSnapshot, verifyRegistryLockfile, verifyRegistrySnapshot } from "./helpers/registry-release-contract.mjs";

// Registry mode installs only published npm packages. Packed mode is an explicit
// prepublication rehearsal of the same consumer, with different provenance checks.
const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const { expectedRoot, packDir, tag } = parseRegistryArguments(process.argv.slice(2), process.env);
const temporaryRoot = realpathSync(mkdtempSync(resolve(tmpdir(), "vooya-registry-consumer-")));

try {
  const expected = expectedRoot ? Object.fromEntries(candidatePackages.filter((name) => existsSync(resolve(expectedRoot, "packages", name, "package.json"))).map((name) => [
    `@vooya/${name}`, JSON.parse(readFileSync(resolve(expectedRoot, "packages", name, "package.json"), "utf8")),
  ])) : undefined;
  const candidates = expectedRoot && existsSync(resolve(expectedRoot, ".changeset/line.json"))
    ? JSON.parse(readFileSync(resolve(expectedRoot, ".changeset/release.json"), "utf8")).packages : undefined;
  const snapshot = packDir ? packedSnapshot(resolve(packDir)) : publishedSnapshot(tag, expected);
  const versions = packDir ? verifyPackedSnapshot(snapshot, expected) : verifyRegistrySnapshot(snapshot, tag, expected, candidates);
  for (const framework of ["vue", "react"]) await verifyConsumer(framework, versions, snapshot);
} finally {
  if (!process.env.VOOYA_KEEP_REGISTRY_FIXTURE) rmSync(temporaryRoot, { force: true, recursive: true });
  else console.log(`Preserved consumer fixtures: ${temporaryRoot}`);
}

function publishedSnapshot(tag, expected) {
  const snapshot = {};
  const pending = new Map(expected ? Object.entries(expected).map(([name, manifest]) => [name, manifest.version]) : registryPackages.map((name) => [`@vooya/${name}`, tag]));
  for (const [name, version] of pending) {
    const manifest = JSON.parse(capture("npm", ["view", `${name}@${version}`, "--json", "--registry=https://registry.npmjs.org/"], repositoryRoot));
    snapshot[name] = manifest;
    for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
      for (const [dependency, range] of Object.entries(manifest[field] ?? {})) {
        if (dependency.startsWith("@vooya/") && !pending.has(dependency)) pending.set(dependency, range);
      }
    }
  }
  return snapshot;
}

function packedSnapshot(directory) {
  const snapshot = {};
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".tgz")) continue;
    const path = realpathSync(resolve(directory, entry.name));
    const manifest = JSON.parse(capture("tar", ["-xOf", path, "package/package.json"], directory));
    if (!candidatePackages.some((name) => manifest.name === `@vooya/${name}`)) continue;
    if (snapshot[manifest.name]) throw new Error(`Duplicate candidate tarball for ${manifest.name}.`);
    snapshot[manifest.name] = {
      ...manifest,
      packedPath: path,
      dist: { integrity: `sha512-${createHash("sha512").update(readFileSync(path)).digest("base64")}` },
    };
  }
  return snapshot;
}

async function verifyConsumer(framework, versions, snapshot) {
  const project = resolve(temporaryRoot, framework);
  cpSync(resolve(repositoryRoot, `tests/fixtures/registry-${framework}`), project, { recursive: true });
  cpSync(resolve(repositoryRoot, "tests/fixtures/registry-rust"), resolve(project, "src"), { recursive: true });
  const packages = packDir
    ? consumerPackages(snapshot, framework).map((name) => snapshot[name].packedPath)
    : [`@vooya/${framework}@${versions[framework]}`, `@vooya/vite@${versions.vite}`];
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--save-exact", "--registry=https://registry.npmjs.org/", ...packages], project);
  const lockfile = JSON.parse(readFileSync(resolve(project, "package-lock.json"), "utf8"));
  if (packDir) verifyPackedLockfile(lockfile, framework, snapshot, project);
  else verifyRegistryLockfile(lockfile, framework, snapshot);
  run("npm", ["exec", "--no", "--", "vooya", "doctor"], project);
  // Build generates declarations; typecheck then checks both authored consumers
  // and installed/generated declarations with skipLibCheck explicitly disabled.
  run("npm", ["run", "build"], project);
  run("npm", ["run", "typecheck"], project);
  const assets = readdirSync(resolve(project, "dist/assets"));
  if (!assets.some((asset) => /^vooya_app_bg-.*\.wasm$/.test(asset))) {
    throw new Error(`${framework} consumer build did not emit the application WASM asset.`);
  }
  await verifyBrowser(project, framework);
  console.log(`Verified ${packDir ? "packed candidate" : `npm ${tag}`} @vooya/${framework}@${versions[framework]} with @vooya/vite@${versions.vite}: doctor, strict types, Rust component/store build, Chromium interaction and unmount/remount.`);
}

async function verifyBrowser(project, framework) {
  const dist = resolve(project, "dist");
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    const file = resolve(dist, pathname === "/" ? "index.html" : pathname.slice(1));
    const path = relative(dist, file);
    if (isAbsolute(path) || path.startsWith("..")) { response.writeHead(403).end(); return; }
    try {
      response.setHeader("Content-Type", { ".wasm": "application/wasm", ".js": "text/javascript", ".css": "text/css", ".html": "text/html" }[extname(file)] ?? "application/octet-stream");
      response.end(readFileSync(file));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise((done, fail) => { server.once("error", fail); server.listen(0, "127.0.0.1", done); });
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.setDefaultTimeout(15_000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Count: 0", exact: true }).waitFor();
    await page.getByRole("button", { name: "Store 0", exact: true }).click();
    const counter = page.getByRole("button", { name: "Count: 1", exact: true });
    await counter.waitFor();
    await page.getByText("Selected 1", { exact: true }).waitFor();
    if (await counter.evaluate((element) => getComputedStyle(element).display) !== "flex") throw new Error(`${framework} Rust scoped CSS was not applied.`);
    await page.getByRole("button", { name: "Store 1", exact: true }).click();
    await page.getByRole("button", { name: "Count: 2", exact: true }).waitFor();
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await page.getByRole("button", { name: "Count: 0", exact: true }).waitFor();
    await page.getByRole("button", { name: "Store 0", exact: true }).click();
    await page.getByRole("button", { name: "Count: 1", exact: true }).waitFor();
    await page.getByRole("button", { name: "Unmount", exact: true }).click();
    await page.getByTestId("island").waitFor({ state: "detached" });
    await page.getByRole("button", { name: "Mount", exact: true }).click();
    await page.getByRole("button", { name: "Count: 0", exact: true }).waitFor();
    await page.getByRole("button", { name: "Store 0", exact: true }).click();
    await page.getByText("Selected 1", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Unmount", exact: true }).click();
    await page.getByTestId("island").waitFor({ state: "detached" });
    if (errors.length) throw new Error(`${framework} consumer browser errors:\n${errors.join("\n")}`);
  } finally {
    if (browser) await browser.close();
    await new Promise((done, fail) => server.close((error) => error ? fail(error) : done()));
  }
}

function commandName(command) { return process.platform === "win32" && command === "npm" ? "npm.cmd" : command; }
function capture(command, args, cwd) {
  const result = spawnSync(commandName(command), args, { cwd, encoding: "utf8", shell: process.platform === "win32" && command === "npm" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
  return result.stdout;
}
function run(command, args, cwd) {
  const result = spawnSync(commandName(command), args, { cwd, stdio: "inherit", shell: process.platform === "win32" && command === "npm" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}.`);
}
