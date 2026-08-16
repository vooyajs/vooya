import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// This is deliberately separate from the local-tarball quickstart test. It
// proves only what is already published under an npm dist-tag; uncommitted
// workspace code must not be able to satisfy any dependency here.
const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const tag = process.env.VOOYA_REGISTRY_TAG ?? "alpha";
const temporaryRoot = mkdtempSync(resolve(tmpdir(), "vooya-registry-consumer-"));

try {
  const versions = publishedVersions(tag);
  verifyFixedRelease(versions, tag);
  verifyConsumer("vue", versions);
  verifyConsumer("react", versions);
} finally {
  if (!process.env.VOOYA_KEEP_REGISTRY_FIXTURE) {
    rmSync(temporaryRoot, { force: true, recursive: true });
  }
}

function publishedVersions(tag) {
  return Object.fromEntries(
    ["compiler", "core", "build-core", "vite-plugin", "vue", "react"].map((name) => [
      name,
      npmView(`@vooya/${name}@${tag}`, "version"),
    ]),
  );
}

function verifyFixedRelease(versions, tag) {
  const distinct = [...new Set(Object.values(versions))];
  if (distinct.length !== 1) {
    throw new Error(`npm dist-tag ${JSON.stringify(tag)} does not resolve Vooya's fixed release group: ${JSON.stringify(versions)}.`);
  }
}

function verifyConsumer(framework, versions) {
  const project = resolve(temporaryRoot, framework);
  cpSync(resolve(repositoryRoot, `tests/fixtures/quickstart-${framework}`), project, { recursive: true });
  const adapter = `@vooya/${framework}`;
  const plugin = "@vooya/vite-plugin";
  const version = versions[framework];

  run("npm", [
    "install", "--ignore-scripts", "--no-audit", "--no-fund", "--save-exact",
    `${adapter}@${version}`, `${plugin}@${versions["vite-plugin"]}`,
  ], project);
  verifyRegistryLockfile(project, framework, versions);
  run("npm", ["exec", "--no", "--", "vooya", "doctor"], project);
  run("npm", ["run", "build"], project);

  const assets = readdirSync(resolve(project, "dist/assets"));
  if (!assets.some((asset) => /^vooya_app_bg-.*\.wasm$/.test(asset))) {
    throw new Error(`${framework} registry consumer build did not emit the application WASM asset.`);
  }
  console.log(`Verified published ${version} ${framework} consumer from npm registry: ${project}`);
}

function verifyRegistryLockfile(project, framework, versions) {
  const lockfile = JSON.parse(readFileSync(resolve(project, "package-lock.json"), "utf8"));
  const expected = {
    "@vooya/compiler": versions.compiler,
    "@vooya/core": versions.core,
    "@vooya/vite-plugin": versions["vite-plugin"],
    [`@vooya/${framework}`]: versions[framework],
  };
  for (const [name, version] of Object.entries(expected)) {
    const entry = lockfile.packages?.[`node_modules/${name}`];
    if (!entry || entry.version !== version) {
      throw new Error(`Registry ${framework} consumer resolved ${name}@${entry?.version ?? "missing"}, expected published ${version}.`);
    }
    if (!entry.resolved?.startsWith("https://registry.npmjs.org/")) {
      throw new Error(`Registry ${framework} consumer did not lock ${name} to npm registry: ${entry.resolved ?? "missing resolution"}.`);
    }
  }
}

function npmView(spec, field) {
  const result = spawnSync("npm", ["view", spec, field, "--json"], { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`npm view ${spec} ${field} failed:\n${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}.`);
}
