import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildPrecompiledArtifact } from "../packages/vite-plugin/src/artifact.js";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const temporaryRoot = mkdtempSync(resolve(tmpdir(), "vooya-artifact-"));
const packages = resolve(temporaryRoot, "packages");
const artifact = resolve(temporaryRoot, "counter-artifact");

try {
  mkdirSync(packages, { recursive: true });
  run("npm", ["run", "build", "--workspace", "@vooya/vue"], repositoryRoot);
  run("npm", ["run", "build", "--workspace", "@vooya/react"], repositoryRoot);
  buildPrecompiledArtifact({
    source: resolve(repositoryRoot, "examples/vue-counter/src/Counter.voo"),
    packageName: "@vooya-fixtures/precompiled-counter",
    version: "0.0.0",
    outputDir: artifact,
  });

  const manifest = JSON.parse(readFileSync(resolve(artifact, "vooya.manifest.json"), "utf8"));
  if (manifest.abiVersion !== 1 || manifest.hosts.vue !== "./dist/vue.js") {
    throw new Error("Precompiled artifact manifest is invalid.");
  }
  const tarballs = {
    artifact: pack(artifact, packages),
    react: packWorkspace("@vooya/react", packages),
    vue: packWorkspace("@vooya/vue", packages),
  };

  const consumerPath = `${dirname(process.execPath)}:/usr/bin:/bin`;
  for (const command of ["cargo", "rustc", "rustup", "wasm-bindgen"]) {
    const unavailable = spawnSync(command, ["--version"], {
      env: { ...process.env, PATH: consumerPath },
    });
    if (unavailable.error?.code !== "ENOENT") {
      throw new Error(`${command} must be unavailable during consumer verification.`);
    }
  }
  for (const framework of ["vue", "react"]) {
    const project = resolve(temporaryRoot, framework);
    writeConsumer(project, framework, tarballs);
    run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], project);
    run("npm", ["run", "build"], project, { PATH: consumerPath });
    assertWasm(project, framework);
  }

  console.log(`Precompiled artifact built in Vue and React without Rust on PATH: ${temporaryRoot}`);
} finally {
  if (!process.env.VOOYA_KEEP_ARTIFACT_FIXTURE) {
    rmSync(temporaryRoot, { force: true, recursive: true });
  }
}

function writeConsumer(project, framework, tarballs) {
  mkdirSync(resolve(project, "src"), { recursive: true });
  const devDependencies = { vite: "^7.0.0" };
  const dependencies = {
    "@vooya-fixtures/precompiled-counter": `file:${tarballs.artifact}`,
  };
  if (framework === "vue") {
    dependencies["@vooya/vue"] = `file:${tarballs.vue}`;
    dependencies.vue = "^3.5.0";
    devDependencies["@vitejs/plugin-vue"] = "^6.0.0";
  } else {
    dependencies["@vooya/react"] = `file:${tarballs.react}`;
    dependencies.react = "^19.0.0";
    dependencies["react-dom"] = "^19.0.0";
    devDependencies["@vitejs/plugin-react"] = "^5.0.0";
  }
  writeFileSync(
    resolve(project, "package.json"),
    `${JSON.stringify({
      name: `vooya-precompiled-${framework}-consumer`,
      private: true,
      type: "module",
      scripts: { build: "vite build" },
      dependencies,
      devDependencies,
    }, null, 2)}\n`,
  );
  writeFileSync(resolve(project, "index.html"), '<div id="app"></div><script type="module" src="/src/main.js"></script>\n');
  if (framework === "vue") {
    writeFileSync(resolve(project, "src/App.vue"), '<script setup>\nimport Counter from "@vooya-fixtures/precompiled-counter/vue";\n</script>\n<template><Counter :initial="1" /></template>\n');
    writeFileSync(resolve(project, "src/main.js"), 'import { createApp } from "vue";\nimport App from "./App.vue";\ncreateApp(App).mount("#app");\n');
    writeFileSync(resolve(project, "vite.config.js"), 'import vue from "@vitejs/plugin-vue";\nimport { defineConfig } from "vite";\nexport default defineConfig({ plugins: [vue()] });\n');
  } else {
    writeFileSync(resolve(project, "src/App.jsx"), 'import Counter from "@vooya-fixtures/precompiled-counter/react";\nexport default function App() { return <Counter initial={1} />; }\n');
    writeFileSync(resolve(project, "src/main.jsx"), 'import { createRoot } from "react-dom/client";\nimport App from "./App.jsx";\ncreateRoot(document.querySelector("#app")).render(<App />);\n');
    writeFileSync(resolve(project, "vite.config.js"), 'import react from "@vitejs/plugin-react";\nimport { defineConfig } from "vite";\nexport default defineConfig({ plugins: [react()] });\n');
    writeFileSync(resolve(project, "index.html"), '<div id="app"></div><script type="module" src="/src/main.jsx"></script>\n');
  }
}

function assertWasm(project, framework) {
  const assets = readdirSync(resolve(project, "dist/assets"));
  if (!assets.some((asset) => /^runtime_bg-.*\.wasm$/.test(asset))) {
    throw new Error(`${framework} consumer did not emit the precompiled WASM asset.`);
  }
}

function packWorkspace(workspace, destination) {
  const result = spawnSync(
    "npm",
    ["pack", "--json", "--workspace", workspace, "--pack-destination", destination],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  if (result.status !== 0) fail("npm pack", result);
  return resolve(destination, JSON.parse(result.stdout)[0].filename);
}

function pack(directory, destination) {
  const result = spawnSync("npm", ["pack", "--json", "--pack-destination", destination], {
    cwd: directory,
    encoding: "utf8",
  });
  if (result.status !== 0) fail("npm pack", result);
  return resolve(destination, JSON.parse(result.stdout)[0].filename);
}

function run(command, args, cwd, environment = {}) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, ...environment },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}.`);
  }
}

function fail(command, result) {
  throw new Error(`${command} failed:\n${result.stderr || result.stdout}`);
}
