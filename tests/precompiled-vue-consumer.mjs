import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

register(new URL("./helpers/css-loader.mjs", import.meta.url));

const root = fileURLToPath(new URL("..", import.meta.url));
const fixture = resolve(root, "tests/fixtures/precompiled-vue");
const temporaryRoot = mkdtempSync(resolve(tmpdir(), "vooya-precompiled-"));
const packages = resolve(temporaryRoot, "packages");
const project = resolve(temporaryRoot, "app");
const artifactSource = resolve(temporaryRoot, "artifact-source");
const productName = "@vooya/test-precompiled-vue-product";
const productVersion = "1.4.0";
const vueVersion = JSON.parse(readFileSync(resolve(root, "packages/vue/package.json"), "utf8")).version;
const adapterRange = `^${vueVersion}`;
const noRustPath = [dirname(process.execPath), "/usr/bin", "/bin"].join(":");

try {
  mkdirSync(packages, { recursive: true });
  cpSync(resolve(fixture, "artifact"), artifactSource, { recursive: true });
  writeFixturePackageManifest();
  run(process.execPath, [resolve(fixture, "build-artifact.mjs"), artifactSource], root);
  assertArtifactManifest();
  run("npm", ["run", "build", "--workspace", "@vooya/vue"], root);
  const vuePackage = packWorkspace("@vooya/vue");
  const artifactPackage = packArtifact();
  assertPackedArtifact(artifactPackage.files);
  cpSync(fixture, project, { recursive: true });
  writeConsumerPackageManifest(artifactPackage.tarball, vuePackage.tarball);
  installConsumer();
  assertTransitiveAdapter();
  run(process.execPath, [resolve(root, "node_modules/typescript/bin/tsc"), "-p", resolve(project, "tsconfig.json")], project);
  const artifactEntry = resolvePublicEntry();
  await assertAbiMismatch(artifactEntry);
  run(process.execPath, [resolve(project, "node_modules/vite/bin/vite.js"), "build"], project, { PATH: noRustPath });
  assertProductionAssets();
  await assertBrowserRun();
  console.log(`Packed precompiled Vue artifact passed without Rust tools in PATH: ${project}`);
} finally {
  if (!process.env.VOOYA_KEEP_PRECOMPILED_FIXTURE) rmSync(temporaryRoot, { force: true, recursive: true });
}

function packWorkspace(workspace) {
  const result = spawnSync("npm", ["pack", "--json", "--workspace", workspace, "--pack-destination", packages], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  const packed = readPackResult(result.stdout);
  return { tarball: resolve(packages, packed.filename), files: packed.files.map((file) => file.path) };
}

function packArtifact() {
  const result = spawnSync("npm", ["pack", "--json", "--pack-destination", packages], { cwd: artifactSource, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  const packed = readPackResult(result.stdout);
  return { tarball: resolve(packages, packed.filename), files: packed.files.map((file) => file.path) };
}

function readPackResult(stdout) {
  const parsed = JSON.parse(stdout);
  const records = Array.isArray(parsed) ? parsed : Object.values(parsed);
  if (records.length !== 1) throw new Error(`Expected one npm pack archive, received ${records.length}.`);
  return records[0];
}

function assertArtifactManifest() {
  const manifest = JSON.parse(readFileSync(resolve(artifactSource, "dist/manifest.json"), "utf8"));
  if (manifest.artifactVersion !== productVersion) throw new Error("Artifact version must identify the product, not the adapter.");
  if (manifest.adapter?.package !== "@vooya/vue" || manifest.adapter.version !== vueVersion || manifest.adapter.range !== adapterRange) {
    throw new Error(`Artifact adapter compatibility was not recorded correctly: ${JSON.stringify(manifest.adapter)}`);
  }
  for (const asset of [manifest.loader, manifest.wasm, manifest.stylesheet]) {
    if (typeof asset !== "string" || !asset.startsWith("./")) throw new Error(`Artifact manifest asset is not package-relative: ${String(asset)}`);
  }
}

function assertPackedArtifact(files) {
  const allowed = files.filter((file) => file === "package.json" || file.startsWith("dist/"));
  if (allowed.length !== files.length) throw new Error(`Packed artifact contains undeclared files: ${files.filter((file) => !allowed.includes(file)).join(", ")}`);
  for (const file of files) {
    if (/\.(?:rs|voo)$/u.test(file) || file.endsWith("Cargo.toml") || file.includes(".artifact-build") || file.includes("/target/")) {
      throw new Error(`Packed artifact contains build input ${file}`);
    }
  }
  for (const file of ["dist/manifest.json", "dist/index.js", "dist/index.d.ts", "dist/component.css", "dist/wasm/vooya_app.js", "dist/wasm/vooya_app_bg.wasm"]) {
    if (!files.includes(file)) throw new Error(`Packed artifact is missing ${file}`);
  }
  const metadata = readFileSync(resolve(artifactSource, "package.json"), "utf8");
  if (metadata.includes(temporaryRoot) || metadata.includes(root)) throw new Error("Packed artifact package metadata contains an absolute checkout path.");
}

function installConsumer() {
  try {
    run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], project);
  } catch (cause) {
    throw new Error("Packed artifact installation failed before WASM loading or ABI checks.", { cause });
  }
}

function resolvePublicEntry() {
  const installed = resolve(project, "node_modules", productName);
  let metadata;
  try {
    metadata = JSON.parse(readFileSync(resolve(installed, "package.json"), "utf8"));
  } catch (cause) {
    throw new Error(`Packed artifact package was not installed: ${productName}.`, { cause });
  }
  const entry = typeof metadata.exports?.["."] === "string" ? metadata.exports["."] : metadata.exports?.["."]?.import;
  if (typeof entry !== "string" || !entry.startsWith("./dist/")) {
    throw new Error(`Packed artifact public export did not resolve through package exports: ${productName}.`);
  }
  return resolve(installed, entry);
}

function assertTransitiveAdapter() {
  const consumer = JSON.parse(readFileSync(resolve(project, "package.json"), "utf8"));
  if ("@vooya/vue" in (consumer.dependencies ?? {}) || "@vooya/vue" in (consumer.devDependencies ?? {})) {
    throw new Error("The consumer must not declare @vooya/vue directly; it must arrive through the artifact product.");
  }
  const installed = JSON.parse(readFileSync(resolve(project, "node_modules", productName, "package.json"), "utf8"));
  if (installed.dependencies?.["@vooya/vue"] !== adapterRange) throw new Error("Installed artifact lost its declared @vooya/vue compatibility range.");
  if (!existsSync(resolve(project, "node_modules/@vooya/vue/package.json"))) throw new Error("The artifact did not install its @vooya/vue adapter transitively.");
}

async function assertAbiMismatch(entry) {
  const artifact = await import(pathToFileURL(entry).href);
  try {
    artifact.assertArtifactAbi(artifact.manifest.abiVersion + 1);
    throw new Error("Artifact ABI mismatch was accepted.");
  } catch (error) {
    if (!/Vooya artifact ABI mismatch for PortableCounter: artifact expects 1, but WASM provides 2\./.test(String(error.message))) throw error;
  }
}

function assertProductionAssets() {
  const dist = resolve(project, "dist");
  const assets = readdirSync(resolve(dist, "assets"));
  if (!assets.some((file) => file.endsWith(".wasm"))) throw new Error("Packed consumer build did not emit artifact WASM.");
  if (!assets.some((file) => file.endsWith(".css"))) throw new Error("Packed consumer build did not emit artifact CSS.");
  const html = readFileSync(resolve(dist, "index.html"), "utf8");
  if (!html.includes("/nested/assets/")) throw new Error("Packed consumer build did not preserve the configured non-root base URL.");
}

async function assertBrowserRun() {
  const dist = resolve(project, "dist");
  const base = "/nested/";
  const server = createServer((request, response) => {
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    if (pathname === "/") {
      response.statusCode = 302;
      response.setHeader("Location", base);
      response.end();
      return;
    }
    if (!pathname.startsWith(base)) {
      response.statusCode = 404;
      response.end("not found");
      return;
    }
    const relative = pathname.slice(base.length) || "index.html";
    const file = resolve(dist, relative);
    try {
      const body = readFileSync(file);
      response.setHeader("Content-Type", file.endsWith(".wasm") ? "application/wasm"
        : file.endsWith(".js") ? "text/javascript"
          : file.endsWith(".css") ? "text/css"
            : "text/html");
      response.setHeader("Content-Length", String(body.byteLength));
      response.end(body);
    } catch (error) {
      console.error(`static server error for ${file}`, error);
      response.statusCode = 404;
      response.end("not found");
    }
  });
  await new Promise((resolve) => server.listen(4191, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const browserErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });
    page.on("pageerror", (error) => browserErrors.push(error.message));
    await page.goto(`http://127.0.0.1:4191${base}`, { waitUntil: "domcontentloaded", timeout: 10_000 });
    const output = page.locator("output.vooya-portable-counter");
    try {
      await output.waitFor({ timeout: 5_000 });
    } catch (error) {
      throw new Error(`Artifact did not mount. HTML: ${await page.locator("body").innerHTML()}`, { cause: error });
    }
    if (await output.textContent() !== "7") throw new Error("Artifact did not mount its initial island value.");
    if (await page.locator("[data-example-handle]").getAttribute("data-example-handle") !== "0") throw new Error("Artifact did not mount into the first Rust handle slot.");
    const outputStyle = await output.evaluate((element) => ({ fontVariantNumeric: getComputedStyle(element).fontVariantNumeric }));
    if (outputStyle.fontVariantNumeric !== "tabular-nums") throw new Error("Packed artifact did not apply its emitted stylesheet.");
    const unrelatedStyle = await page.locator("#unrelated").evaluate((element) => ({ fontVariantNumeric: getComputedStyle(element).fontVariantNumeric }));
    if (unrelatedStyle.fontVariantNumeric === "tabular-nums") throw new Error("Scoped artifact styles leaked onto an unrelated host element.");
    await page.getByRole("button", { name: "Update" }).click({ timeout: 5_000 });
    await output.waitFor({ state: "attached", timeout: 5_000 });
    if (await output.textContent() !== "12") throw new Error("Artifact did not update its island prop.");
    await page.getByRole("button", { name: "Dispose" }).click({ timeout: 5_000 });
    await output.waitFor({ state: "detached", timeout: 5_000 });
    await page.getByRole("button", { name: "Mount" }).click({ timeout: 5_000 });
    await output.waitFor({ state: "attached", timeout: 5_000 });
    if (await output.textContent() !== "12") throw new Error("Artifact did not re-mount with the latest props after disposal.");
    if (await page.locator("[data-example-handle]").getAttribute("data-example-handle") !== "0") throw new Error("Artifact disposal did not release the Rust handle slot before re-mount.");
    if (browserErrors.length > 0) throw new Error(`Clean consumer had browser errors: ${browserErrors.join("\n")}`);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

function writeFixturePackageManifest() {
  writeFileSync(
    resolve(artifactSource, "package.json"),
    `${JSON.stringify({
      name: productName,
      version: productVersion,
      type: "module",
      files: ["dist"],
      exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } },
      dependencies: { "@vooya/vue": adapterRange },
    }, null, 2)}\n`,
  );
}

function writeConsumerPackageManifest(artifactTarball, vueTarball) {
  const metadata = JSON.parse(readFileSync(resolve(fixture, "package.json"), "utf8"));
  metadata.dependencies = { ...metadata.dependencies, [productName]: `file:${artifactTarball}` };
  // The consumer declares only the product. This offline test override points the
  // product's declared @vooya/vue range at the locally packed matching adapter.
  metadata.overrides = { "@vooya/vue": `file:${vueTarball}` };
  writeFileSync(resolve(project, "package.json"), `${JSON.stringify(metadata, null, 2)}\n`);
}

function run(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}.`);
}
