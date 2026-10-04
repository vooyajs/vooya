// Install packed public packages into independent applications: no workspace aliases.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("..", import.meta.url));
const temporary = mkdtempSync(resolve(tmpdir(), "vooya-rust-bundlers-"));
const packages = ["compiler", "core", "build-core", "vue", "react", "webpack", "rspack"];
const vueApp = `import { createApp, h, ref } from "vue";
import Counter from "../Counter.rs";
import { useCart } from "../Store.rs";
const Island = { setup() {
  const { state, add } = useCart();
  const selected = ref(-1);
  return () => h("section", [
    h(Counter, { count: state.value?.count ?? 0, onSelected: (value) => { selected.value = value; } }),
    h("span", "Selected " + selected.value), h("button", { id: "add", onClick: () => add(1) }, "Add"),
  ]);
}};
createApp({ setup() {
  const visible = ref(true);
  return () => h("main", [h("button", { id: "toggle", onClick: () => { visible.value = !visible.value; } }, "Toggle"), visible.value ? h(Island) : null]);
}}).mount("#app");`;
const reactApp = `import { createElement as h, useState } from "react";
import { createRoot } from "react-dom/client";
import Counter from "../Counter.rs";
import { useCart } from "../Store.rs";
function Island() {
  const { state, add } = useCart();
  const [selected, setSelected] = useState(-1);
  return h("section", null,
    h(Counter, { count: state?.count ?? 0, onSelected: setSelected }),
    h("span", null, "Selected " + selected), h("button", { id: "add", onClick: () => add(1) }, "Add"));
}
function App() {
  const [visible, setVisible] = useState(true);
  return h("main", null, h("button", { id: "toggle", onClick: () => setVisible(!visible) }, "Toggle"), visible ? h(Island) : null);
}
createRoot(document.getElementById("app")).render(h(App));`;
try {
  mkdirSync(resolve(temporary, "packages"));
  const packed = packages.map((name) => pack(name));
  for (const bundler of ["webpack", "rspack"]) {
    for (const framework of ["vue", "react"]) {
      const project = resolve(temporary, `${bundler}-${framework}`);
      prepare(project, bundler, framework);
      run("npm", ["install", "--prefer-offline", "--ignore-scripts", "--no-audit", "--no-fund", ...packed.filter((file) => !file.includes(`vooya-${bundler === "webpack" ? "rspack" : "webpack"}-`))], project);
      run("npm", ["run", "build"], project);
      const declaration = readFileSync(resolve(project, ".vooya/types/Counter.d.rs.ts"), "utf8");
      assert.match(declaration, /count: number/);
      assert.match(readFileSync(resolve(project, ".vooya/types/Store.d.rs.ts"), "utf8"), /useCart/);
      assert.ok(readdirSync(resolve(project, "dist")).some((name) => name.endsWith(".wasm")));
      await verify(project);
      if (framework === "vue") await verifyWatch(project, bundler);
      console.log(`Verified packed ${bundler} ${framework}: .rs component, scoped CSS, Store, props/events, unmount/remount, sourceRoot dot.`);
    }
  }
} finally {
  if (!process.env.VOOYA_KEEP_RUST_BUNDLER_FIXTURES) rmSync(temporary, { recursive: true, force: true });
  else console.log(`Kept fixtures: ${temporary}`);
}

function prepare(project, bundler, framework) {
  mkdirSync(resolve(project, "src"), { recursive: true });
  // Both frameworks use the same real Rust contract; Store declarations include named snapshot types.
  cpSync(resolve(root, "tests/fixtures/rust-solid/src/Counter.rs"), resolve(project, "Counter.rs"));
  cpSync(resolve(root, "tests/fixtures/rust-solid/src/Store.rs"), resolve(project, "Store.rs"));
  const counterPath = resolve(project, "Counter.rs");
  writeFileSync(counterPath, readFileSync(counterPath, "utf8")
    .replace("#[voo::component]", '#[voo::component]\n#[voo::style("./Counter.css", scoped)]')
    .replace('<button>{label}</button>', '<button class="rust-counter">{label}</button>'));
  writeFileSync(resolve(project, "Counter.css"), ".rust-counter { color: rgb(5, 103, 89); }\n");
  writeFileSync(resolve(project, "index.html"), '<!doctype html><div id="app"></div>');
  writeFileSync(resolve(project, "src/main.js"), framework === "vue" ? vueApp : reactApp);
  const deps = bundler === "webpack"
    ? { webpack: "5.109.2", "webpack-cli": "7.2.2", "html-webpack-plugin": "5.6.3", "style-loader": "4.0.0", "css-loader": "7.1.2" }
    : { "@rspack/core": "2.1.10", "@rspack/cli": "2.1.10" };
  writeFileSync(resolve(project, "package.json"), JSON.stringify({
    private: true, type: "module", scripts: { build: `${bundler} --mode production --config bundler.config.mjs` },
    dependencies: { vue: "3.5.30", react: "19.0.0", "react-dom": "19.0.0" }, devDependencies: deps,
  }, null, 2));
  const imports = bundler === "webpack"
    ? 'import HtmlPlugin from "html-webpack-plugin";\nimport { vooyaWebpack as integration } from "@vooya/webpack";'
    : 'import { rspack } from "@rspack/core";\nimport { vooyaRspack as integration } from "@vooya/rspack";\nconst HtmlPlugin = rspack.HtmlRspackPlugin;';
  writeFileSync(resolve(project, "bundler.config.mjs"), `${imports}
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = dirname(fileURLToPath(import.meta.url));
const vooya = integration({ framework: ${JSON.stringify(framework)}, rust: { sourceRoot: "." } });
export default {
  context: root, entry: "./src/main.js", output: { path: resolve(root, "dist"), clean: true },
  experiments: { asyncWebAssembly: true${bundler === "rspack" ? ", css: true" : ""} },
  module: { rules: [vooya.rule(), { test: /\\.css$/, ${bundler === "webpack" ? 'use: ["style-loader", "css-loader"]' : 'type: "css/auto"'} }] },
  plugins: [vooya, new HtmlPlugin({ template: "index.html" })],
};\n`);
}

function pack(name) {
  const result = run("npm", ["pack", "--workspace", `@vooya/${name}`, "--pack-destination", resolve(temporary, "packages"), "--json"], root, true);
  return resolve(temporary, "packages", JSON.parse(result)[0].filename);
}
function run(command, args, cwd, capture = false) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", stdio: capture ? "pipe" : "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr ?? result.status}`);
  return result.stdout;
}
async function verify(project, label = "Count", color = "rgb(5, 103, 89)") {
  const server = createServer((request, response) => {
    const url = request.url === "/" ? "/index.html" : request.url.split("?")[0];
    try {
      const body = readFileSync(resolve(project, "dist", `.${url}`));
      response.setHeader("Content-Type", url.endsWith(".wasm") ? "application/wasm" : url.endsWith(".js") ? "text/javascript" : url.endsWith(".css") ? "text/css" : "text/html");
      response.end(body);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.getByRole("button", { name: `${label}: 0`, exact: true }).waitFor();
    assert.equal(await page.locator(".rust-counter").evaluate((node) => getComputedStyle(node).color), color);
    await page.locator("#add").click();
    await page.getByRole("button", { name: `${label}: 1`, exact: true }).waitFor();
    await page.getByText("Selected 1", { exact: true }).waitFor();
    await page.locator("#toggle").click();
    await page.locator(".rust-counter").waitFor({ state: "detached" });
    await page.locator("#toggle").click();
    await page.getByRole("button", { name: `${label}: 0`, exact: true }).waitFor();
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((done) => server.close(done));
  }
}


async function verifyWatch(project, bundler) {
  const api = bundler === "webpack" ? 'import build from "webpack";' : 'import { rspack as build } from "@rspack/core";';
  writeFileSync(resolve(project, "watch.mjs"), `${api}
import config from "./bundler.config.mjs";
import { resolveToolchain } from "@vooya/build-core";
import { writeFileSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
const cargo = resolveToolchain({ cwd: process.cwd(), mode: "system" }).cargo.path;
const wrapper = resolve("watch-cargo.cjs");
writeFileSync(wrapper, \`#!\${process.execPath}
const { spawnSync } = require("node:child_process");
const { existsSync, readFileSync, writeFileSync, unlinkSync } = require("node:fs");
const args = process.argv.slice(2);
const result = spawnSync(\${JSON.stringify(cargo)}, args, { stdio: "inherit", env: process.env });
const marker = \${JSON.stringify(resolve("race-edit.json"))};
if (result.status === 0 && args.includes("--message-format=json") && existsSync(marker)) {
  const edit = JSON.parse(readFileSync(marker, "utf8"));
  writeFileSync(edit.path, edit.source);
  unlinkSync(marker);
  console.log("WATCH_RACE_EDIT");
}
process.exit(result.status ?? 1);
\`);
chmodSync(wrapper, 0o755);
config.plugins[0].toolchain = { mode: "system", cargoPath: wrapper };
const compiler = build({ ...config, mode: "development" });
const watcher = compiler.watch({ aggregateTimeout: 100 }, (error, stats) => {
  if (error || stats.hasErrors()) console.log("WATCH_ERROR", error?.message ?? stats.toString({ all: false, errors: true }));
  else console.log("WATCH_SUCCESS");
});
process.on("SIGTERM", () => watcher.close(() => compiler.close(() => process.exit(0))));
`);
  const sourcePath = resolve(project, "Counter.rs");
  const original = readFileSync(sourcePath, "utf8");
  let output = "";
  const processHandle = spawn(process.execPath, ["watch.mjs"], { cwd: project, stdio: ["ignore", "pipe", "pipe"] });
  processHandle.stdout.on("data", (chunk) => { output += chunk; });
  processHandle.stderr.on("data", (chunk) => { output += chunk; });
  const successes = () => output.match(/WATCH_SUCCESS/g)?.length ?? 0;
  try {
    await waitFor(() => successes() > 0, () => output);
    await settle(successes, () => output);
    const initial = successes();
    await new Promise((done) => setTimeout(done, 1200));
    assert.equal(successes(), initial, `${bundler} rebuilt its own generated assets without an authored edit.\n${output}`);
    // Simulate a second save after Cargo has already consumed the first edit.
    // The first artifact must not acknowledge that newer source fingerprint.
    writeFileSync(resolve(project, "race-edit.json"), JSON.stringify({ path: sourcePath, source: original.replace("Count: {}", "During build: {}") }));
    const beforeRace = successes();
    writeFileSync(sourcePath, original.replace("Count: {}", "First edit: {}"));
    await waitFor(() => output.includes("WATCH_RACE_EDIT") && successes() > beforeRace + 1, () => output);
    await settle(successes, () => output);
    await verify(project, "During build");
    writeFileSync(sourcePath, `${original}\ninvalid Rust\n`);
    await waitFor(() => output.includes("WATCH_ERROR"), () => output);
    assert.equal(processHandle.exitCode, null, `${bundler} watch exited after Rust error.`);
    const beforeRecovery = successes();
    writeFileSync(sourcePath, original.replace("Count: {}", "Recovered: {}"));
    await waitFor(() => successes() > beforeRecovery, () => output);
    await verify(project, "Recovered");
    await settle(successes, () => output);
    const recovered = successes();
    await new Promise((done) => setTimeout(done, 1200));
    assert.equal(successes(), recovered, `${bundler} did not settle after Rust recovery.\n${output}`);
    const stylePath = resolve(project, "Counter.css");
    writeFileSync(stylePath, ".rust-counter { color: rgb(90, 30, 70); }\n");
    await waitFor(() => successes() > recovered, () => output);
    // Generated CSS can invalidate its Webpack module in the following watch pass.
    await settle(successes, () => output);
    await verify(project, "Recovered", "rgb(90, 30, 70)");
    const styled = successes();
    await new Promise((done) => setTimeout(done, 1200));
    assert.equal(successes(), styled, `${bundler} did not settle after stylesheet edit.\n${output}`);
    const errorsBeforeNewFile = output.match(/WATCH_ERROR/g)?.length ?? 0;
    const extraSource = resolve(project, "Extra.rs");
    writeFileSync(extraSource, "invalid new Rust module\n");
    await waitFor(() => (output.match(/WATCH_ERROR/g)?.length ?? 0) > errorsBeforeNewFile, () => output);
    const beforeNewFileRecovery = successes();
    writeFileSync(extraSource, "pub fn value() -> u32 { 1 }\n");
    await waitFor(() => successes() > beforeNewFileRecovery, () => output);
    await settle(successes, () => output);
    const errorsBeforeUndo = output.match(/WATCH_ERROR/g)?.length ?? 0;
    const undoSource = resolve(project, "Undo.rs");
    writeFileSync(undoSource, "invalid new Rust module\n");
    await waitFor(() => (output.match(/WATCH_ERROR/g)?.length ?? 0) > errorsBeforeUndo, () => output);
    const beforeUndo = successes();
    rmSync(undoSource);
    await waitFor(() => successes() > beforeUndo, () => output);
    await settle(successes, () => output);
    console.log(`Verified ${bundler} Rust-file watch: invalid Rust, recovery, stylesheet update, new .rs detection/recovery, edits during compilation, undo by deletion, and no generated-file rebuild loop.`);
  } catch (error) {
    console.error(output);
    throw error;
  } finally {
    processHandle.kill("SIGTERM");
    await Promise.race([new Promise((done) => processHandle.once("exit", done)), new Promise((done) => setTimeout(done, 3000))]);
    if (processHandle.exitCode === null) processHandle.kill("SIGKILL");
  }
}
async function waitFor(predicate, detail) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(`Timed out waiting for Rust watch compilation.\n${detail()}`);
}

async function settle(count, detail) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const before = count();
    await new Promise((done) => setTimeout(done, 800));
    if (count() === before) return;
  }
  throw new Error(`Bundler did not settle after generated output.\n${detail()}`);
}
