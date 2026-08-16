import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const temporaryRoot = mkdtempSync(resolve(tmpdir(), "vooya-quickstart-"));
const packageDirectory = resolve(temporaryRoot, "packages");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

try {
  mkdirSync(packageDirectory, { recursive: true });
  run(npmCommand, ["run", "build:core"], repositoryRoot);
  run(npmCommand, ["run", "build", "--workspace", "@vooya/vue"], repositoryRoot);
  run(npmCommand, ["run", "build", "--workspace", "@vooya/react"], repositoryRoot);
  const packages = {
    common: [
      pack("@vooya/compiler"),
      pack("@vooya/core"),
      pack("@vooya/build-core"),
      pack("@vooya/vite-plugin"),
    ],
    vue: pack("@vooya/vue"),
    react: pack("@vooya/react"),
  };

  verifyGettingStarted();
  verifyQuickstart("vue", packages);
  verifyQuickstart("react", packages);
} finally {
  if (!process.env.VOOYA_KEEP_QUICKSTART_FIXTURE) rmSync(temporaryRoot, { force: true, recursive: true });
}

function verifyGettingStarted() {
  const guide = readFileSync(resolve(repositoryRoot, "docs/guide/getting-started.md"), "utf8");
  const greeting = readFileSync(resolve(repositoryRoot, "tests/fixtures/quickstart-vue/src/Greeting.voo"), "utf8");
  const shared = [
    "npm exec -- vooya doctor",
    "npm run dev",
    "npm run build",
    greeting.trim(),
  ];
  const frameworkSpecific = {
    vue: [
      "## Vue",
      'npm install @vooya/vue@alpha',
      'npm install --save-dev @vooya/vite-plugin@alpha',
      "plugins: [vue(), vooya()]",
      'import Greeting from "./Greeting.voo";',
      "<Greeting />",
    ],
    react: [
      "## React",
      'npm install @vooya/react@alpha',
      'npm install --save-dev @vooya/vite-plugin@alpha',
      "plugins: [react(), vooya({ framework: \"react\" })]",
      "return <Greeting name=\"Rust\" />;",
      "[React counter](../../examples/react-counter)",
    ],
  };
  for (const expected of [...shared, ...frameworkSpecific.vue, ...frameworkSpecific.react]) {
    if (!guide.includes(expected)) throw new Error(`Getting Started drifted from a tested quickstart: missing ${JSON.stringify(expected)}.`);
  }
}

function verifyQuickstart(framework, packages) {
  const fixture = resolve(repositoryRoot, `tests/fixtures/quickstart-${framework}`);
  const project = resolve(temporaryRoot, framework);
  cpSync(fixture, project, { recursive: true });
  run(npmCommand, ["install", "--ignore-scripts", "--no-audit", "--no-fund", ...packages.common, packages[framework]], project);
  // Exercise the CLI from the installed consumer dependency tree. This keeps
  // the documented preflight separate from the workspace's own PATH.
  run(npmCommand, ["exec", "--", "vooya", "doctor"], project);
  run(npmCommand, ["run", "build"], project);

  const assets = readdirSync(resolve(project, "dist/assets"));
  if (!assets.some((asset) => /^vooya_app_bg-.*\.wasm$/.test(asset))) {
    throw new Error(`${framework} quickstart build did not emit the application WASM asset.`);
  }
  console.log(`Verified ${framework} source quickstart outside the checkout: ${project}`);
}

function pack(workspace) {
  const result = spawnSync(
    npmCommand,
    ["pack", "--json", "--workspace", workspace, "--pack-destination", packageDirectory],
    { cwd: repositoryRoot, encoding: "utf8", shell: process.platform === "win32" },
  );
  if (result.status !== 0) fail("npm pack", result);
  const [{ filename }] = JSON.parse(result.stdout);
  return resolve(packageDirectory, filename);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}.`);
}

function fail(command, result) {
  throw new Error(`${command} failed:\n${result.stderr || result.stdout}`);
}
