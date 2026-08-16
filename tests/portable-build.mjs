import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const fixture = resolve(repositoryRoot, "tests/fixtures/portable-vue");
const temporaryRoot = mkdtempSync(resolve(tmpdir(), "vooya-portable-"));
const packageDirectory = resolve(temporaryRoot, "packages");
const project = resolve(temporaryRoot, "app");

try {
  mkdirSync(packageDirectory, { recursive: true });
  run("npm", ["run", "build:core"], repositoryRoot);
  run("npm", ["run", "build", "--workspace", "@vooya/vue"], repositoryRoot);

  const packages = [
    pack("@vooya/compiler", packageDirectory),
    pack("@vooya/core", packageDirectory),
    pack("@vooya/build-core", packageDirectory),
    pack("@vooya/vite-plugin", packageDirectory),
    pack("@vooya/vue", packageDirectory),
  ];

  cpSync(fixture, project, { recursive: true });
  run(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", ...packages],
    project,
  );
  run("npm", ["run", "build"], project);

  const assets = readdirSync(resolve(project, "dist/assets"));
  if (!assets.some((asset) => /^vooya_app_bg-.*\.wasm$/.test(asset))) {
    throw new Error("Portable build did not emit the application WASM asset.");
  }
  console.log(`Portable Vooya build passed outside the checkout: ${project}`);
} finally {
  if (!process.env.VOOYA_KEEP_PORTABLE_FIXTURE) {
    rmSync(temporaryRoot, { force: true, recursive: true });
  }
}

function pack(workspace, destination) {
  const result = spawnSync(
    "npm",
    ["pack", "--json", "--workspace", workspace, "--pack-destination", destination],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  if (result.status !== 0) fail("npm pack", result);
  const [{ filename }] = JSON.parse(result.stdout);
  return resolve(destination, filename);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}.`);
  }
}

function fail(command, result) {
  throw new Error(`${command} failed:\n${result.stderr || result.stdout}`);
}
