import { spawn, spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const targetName = process.argv[2] ?? "vite8";
const targets = {
  vite8: {
    label: "Vite 8",
    version: "8.2.1",
    install: [],
    overrides: {},
    build: ["node_modules/vite/bin/vite.js", "build"],
    dev: ["node_modules/vite/bin/vite.js"],
  },
  "vite-plus": {
    label: "Vite+",
    version: "0.2.9",
    install: ["vite-plus@0.2.9"],
    overrides: {
      vite: "npm:@voidzero-dev/vite-plus-core@0.2.9",
      vitest: "4.1.10",
    },
    build: ["node_modules/vite-plus/bin/vp", "build"],
    dev: ["node_modules/vite-plus/bin/vp", "dev"],
  },
  "vite8-vue36-vapor": {
    label: "Vite 8 + Vue 3.6 Vapor",
    version: "8.2.1",
    vueVersion: "3.6.0-beta.17",
    fixture: "quickstart-vue",
    vapor: true,
    install: [],
    overrides: {},
    build: ["node_modules/vite/bin/vite.js", "build"],
    dev: ["node_modules/vite/bin/vite.js"],
    selector: ".greeting",
    expectedText: "Hello, world.",
  },
};
const target = targets[targetName];
if (!target) throw new Error(`Unknown Vite compatibility target: ${targetName}`);

const temporaryRoot = mkdtempSync(resolve(tmpdir(), `vooya-${targetName}-`));
const packageDirectory = resolve(temporaryRoot, "packages");
const project = resolve(temporaryRoot, "app");
let browser;
let server;
let productionServer;
let output = "";

try {
  mkdirSync(packageDirectory, { recursive: true });
  run("npm", ["run", "build:core"], repositoryRoot);
  run("npm", ["run", "build", "--workspace", "@vooya/vite"], repositoryRoot);
  run("npm", ["run", "build", "--workspace", "@vooya/vue"], repositoryRoot);

  const packages = {
    compiler: pack("@vooya/compiler"),
    core: pack("@vooya/core"),
    buildCore: pack("@vooya/build-core"),
    plugin: pack("@vooya/vite"),
    vue: pack("@vooya/vue"),
  };
  cpSync(resolve(repositoryRoot, `tests/fixtures/${target.fixture ?? "portable-vue"}`), project, { recursive: true });
  if (target.vapor) {
    const configPath = resolve(project, "vite.config.js");
    const config = readFileSync(configPath, "utf8")
      .replace("vue()", "vue({ features: { vapor: true } })")
      .replace(
        "plugins: [vue({ features: { vapor: true } }), vooya()]",
        'resolve: { alias: { vue: new URL("./node_modules/vue/dist/vue.runtime-with-vapor.esm-browser.js", import.meta.url).pathname } },\n  plugins: [vue({ features: { vapor: true } }), vooya()]',
      );
    writeFileSync(configPath, config);
    const entryPath = resolve(project, "src/main.js");
    const entry = readFileSync(entryPath, "utf8")
      .replace("{ createApp }", "{ createVaporApp, vaporInteropPlugin }")
      .replace("createApp(App).mount", "createVaporApp(App).use(vaporInteropPlugin).mount");
    writeFileSync(entryPath, entry);
  }
  configureProject(packages);
  const installArguments = ["install", "--ignore-scripts", "--no-audit", "--no-fund"];
  if (targetName === "vite-plus" || target.vapor) installArguments.push("--legacy-peer-deps");
  installArguments.push(...target.install);
  run("npm", installArguments, project);

  run(process.execPath, target.build.map((entry, index) => (index === 0 ? resolve(project, entry) : entry)), project);
  const assets = readdirSync(resolve(project, "dist/assets"));
  if (!assets.some((asset) => /^vooya_app_bg-.*\.wasm$/.test(asset))) {
    throw new Error(`${target.label} production build did not emit application WASM.`);
  }
  await exerciseProductionBuild();
  if (targetName === "vite8") {
    await exerciseDevelopmentServer();
    console.log(`${target.label} production browser, rebuild, HMR, and error-recovery checks passed.`);
  } else {
    console.log(`${target.label} production browser compatibility smoke passed; full HMR remains covered by the Vite 8 path.`);
  }
} finally {
  await browser?.close();
  if (productionServer) {
    await new Promise((resolveClose, rejectClose) => {
      productionServer.close((error) => (error ? rejectClose(error) : resolveClose()));
    });
  }
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await Promise.race([
      new Promise((resolveClose) => server.once("close", resolveClose)),
      new Promise((resolveTimeout) => setTimeout(resolveTimeout, 2_000)),
    ]);
    if (server.exitCode === null) server.kill("SIGKILL");
  }
  if (process.env.VOOYA_KEEP_COMPAT_FIXTURE) {
    console.log(`Kept compatibility fixture: ${temporaryRoot}`);
  } else {
    rmSync(temporaryRoot, { force: true, recursive: true });
  }
}

function configureProject(packages) {
  const manifestPath = resolve(project, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.dependencies = {
    vue: target.vueVersion ?? "3.5.2",
    "@vooya/vue": `file:${packages.vue}`,
  };
  manifest.devDependencies = {
    "@vitejs/plugin-vue": "6.0.8",
    vite: targetName === "vite-plus" ? "npm:@voidzero-dev/vite-plus-core@0.2.9" : target.version,
    "@vooya/compiler": `file:${packages.compiler}`,
    "@vooya/core": `file:${packages.core}`,
    "@vooya/build-core": `file:${packages.buildCore}`,
    "@vooya/vite": `file:${packages.plugin}`,
    ...(target.install.length ? { "vite-plus": target.version } : {}),
  };
  if (Object.keys(target.overrides).length > 0) manifest.overrides = target.overrides;
  manifest.scripts = { build: targetName === "vite-plus" ? "vp build" : "vite build" };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function exerciseProductionBuild() {
  const port = await availablePort();
  const dist = resolve(project, "dist");
  productionServer = createHttpServer((request, response) => {
    const pathname = new URL(request.url ?? "/", `http://${request.headers.host}`).pathname;
    const requestedPath = pathname === "/" ? "index.html" : pathname.slice(1);
    const filePath = resolve(dist, requestedPath);
    const relativePath = relative(dist, filePath);
    if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    try {
      const body = readFileSync(filePath);
      response.writeHead(200, { "Content-Type": contentType(filePath) }).end(body);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
  await new Promise((resolveListen, rejectListen) => {
    productionServer.once("error", rejectListen);
    productionServer.listen(port, "127.0.0.1", resolveListen);
  });

  browser ??= await chromium.launch();
  const page = await browser.newPage();
  const browserErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}`);
  await expectText(page, target.expectedText ?? "6");
  await page.close();
  if (browserErrors.length > 0) {
    throw new Error(`${target.label} production browser errors:\n${browserErrors.join("\n")}`);
  }

  await new Promise((resolveClose, rejectClose) => {
    productionServer.close((error) => (error ? rejectClose(error) : resolveClose()));
  });
  productionServer = undefined;
}

async function exerciseDevelopmentServer() {
  const port = await availablePort();
  const [entry, ...args] = target.dev;
  server = spawn(process.execPath, [resolve(project, entry), ...args, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: project,
    env: { ...process.env, FORCE_COLOR: "0" },
  });
  server.stdout.on("data", collectOutput);
  server.stderr.on("data", collectOutput);
  await waitForServer(`http://127.0.0.1:${port}`);

  browser ??= await chromium.launch();
  const page = await browser.newPage();
  const browserWarnings = [];
  page.on("console", (message) => {
    if (message.type() === "warning" && message.text().includes("externalized for browser compatibility")) {
      browserWarnings.push(message.text());
    }
  });
  await page.goto(`http://127.0.0.1:${port}`);
  await expectText(page, target.expectedText ?? "6");
  if (browserWarnings.length > 0) {
    throw new Error(`${target.label} leaked Node-only modules into the browser:\n${browserWarnings.join("\n")}`);
  }

  const dependencyPath = resolve(project, "rust/portable-math/src/lib.rs");
  const dependency = readFileSync(dependencyPath, "utf8");
  writeFileSync(dependencyPath, dependency.replace("value * 2", "value * 3"));
  await expectText(page, "9");

  const componentPath = resolve(project, "src/PortableCounter.voo");
  const source = readFileSync(componentPath, "utf8");
  const invalid = source.replace(
    ".text(&display_value(context.props.initial).to_string())",
    ".text(&missing_value.to_string())",
  );
  writeFileSync(componentPath, invalid);
  await waitFor(() => output.includes("Cargo build failed with exit code"));
  if (server.exitCode !== null) throw new Error(`${target.label} exited after a failed Rust rebuild.`);

  writeFileSync(
    componentPath,
    source.replace(
      ".text(&display_value(context.props.initial).to_string())",
      ".text(&(display_value(context.props.initial) + 4).to_string())",
    ),
  );
  await expectText(page, "13");

  const failuresBeforeRapidSave = occurrences(output, "Cargo build failed with exit code");
  writeFileSync(componentPath, invalid);
  writeFileSync(
    componentPath,
    source.replace(
      ".text(&display_value(context.props.initial).to_string())",
      ".text(&(display_value(context.props.initial) + 5).to_string())",
    ),
  );
  await expectText(page, "14");
  const failuresAfterRapidSave = occurrences(output, "Cargo build failed with exit code");
  if (failuresAfterRapidSave !== failuresBeforeRapidSave) {
    throw new Error(`${target.label} compiled a superseded rapid save instead of coalescing it.`);
  }
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".wasm")) return "application/wasm";
  return "application/octet-stream";
}

function pack(workspace) {
  const result = spawnSync(
    "npm",
    ["pack", "--json", "--workspace", workspace, "--pack-destination", packageDirectory],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(`npm pack failed:\n${result.stderr || result.stdout}`);
  const [{ filename }] = JSON.parse(result.stdout);
  return resolve(packageDirectory, filename);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}.`);
}

function collectOutput(chunk) {
  output += chunk.toString();
}

async function expectText(page, expected) {
  await page.locator(target.selector ?? ".portable-counter").getByText(expected, { exact: true }).waitFor({ timeout: 30_000 });
}

async function waitForServer(url) {
  await waitFor(async () => {
    try {
      return (await fetch(url)).ok;
    } catch {
      return false;
    }
  }, 30_000);
}

async function waitFor(predicate, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`Timed out waiting for ${target.label} compatibility check.\n${output}`);
}

function occurrences(source, value) {
  return source.split(value).length - 1;
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
