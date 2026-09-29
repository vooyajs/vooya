import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseRegistryArguments, registryPackages, verifyRegistryLockfile, verifyRegistrySnapshot } from "./helpers/registry-release-contract.mjs";

// This is deliberately separate from the local-tarball quickstart test. It
// proves only what is already published under an npm dist-tag; uncommitted
// workspace code must not be able to satisfy any dependency here.
const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const tag = process.env.VOOYA_REGISTRY_TAG ?? "alpha";
const { expectedRoot } = parseRegistryArguments(process.argv.slice(2), process.env);
const temporaryRoot = mkdtempSync(resolve(tmpdir(), "vooya-registry-consumer-"));

try {
  const snapshot = publishedSnapshot(tag);
  const expected = expectedRoot ? Object.fromEntries(registryPackages.map((name) => [
    `@vooya/${name}`, JSON.parse(readFileSync(resolve(expectedRoot, "packages", name, "package.json"), "utf8")),
  ])) : undefined;
  const versions = verifyRegistrySnapshot(snapshot, tag, expected);
  verifyConsumer("vue", versions, snapshot);
  verifyConsumer("react", versions, snapshot);
} finally {
  if (!process.env.VOOYA_KEEP_REGISTRY_FIXTURE) {
    rmSync(temporaryRoot, { force: true, recursive: true });
  }
}

function publishedSnapshot(tag) {
  return Object.fromEntries(
    registryPackages.map((name) => [
      `@vooya/${name}`,
      npmView(`@vooya/${name}@${tag}`),
    ]),
  );
}

function verifyConsumer(framework, versions, snapshot) {
  const project = resolve(temporaryRoot, framework);
  cpSync(resolve(repositoryRoot, `tests/fixtures/quickstart-${framework}`), project, { recursive: true });
  const adapter = `@vooya/${framework}`;
  const plugin = "@vooya/vite";
  const version = versions[framework];

  run("npm", [
    "install", "--ignore-scripts", "--no-audit", "--no-fund", "--save-exact",
    `${adapter}@${version}`, `${plugin}@${versions["vite"]}`,
  ], project);
  verifyRegistryLockfile(JSON.parse(readFileSync(resolve(project, "package-lock.json"), "utf8")), framework, snapshot);
  run("npm", ["exec", "--no", "--", "vooya", "doctor"], project);
  run("npm", ["run", "build"], project);

  const assets = readdirSync(resolve(project, "dist/assets"));
  if (!assets.some((asset) => /^vooya_app_bg-.*\.wasm$/.test(asset))) {
    throw new Error(`${framework} registry consumer build did not emit the application WASM asset.`);
  }
  console.log(`Verified published ${adapter}@${version} with ${plugin}@${versions.vite} from npm registry: ${project}`);
}

function npmView(spec) {
  const result = spawnSync("npm", ["view", spec, "--json", "--registry=https://registry.npmjs.org/"], { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`npm view ${spec} failed:\n${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}.`);
}
