import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { alphaPublishPlan } from "../scripts/generated/alpha-publish-plan.js";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("..", import.meta.url));
const cli = require.resolve("@changesets/cli/bin.js");
assert.equal(require("@changesets/cli/package.json").version, "3.0.3");
const fixture = mkdtempSync(resolve(tmpdir(), "vooya-release-pipeline-"));
const expected = [
  { name: "@vooya/core", version: "0.1.0-alpha.13" },
  { name: "@vooya/vite", version: "0.1.0-alpha.24" },
];

try {
  setup();
  git("init", "--quiet");
  commit("fixture before release");
  const base = git("rev-parse", "HEAD").trim();
  const oldVue = readFileSync(resolve(fixture, "packages/vue/package.json"), "utf8");

  run(process.execPath, [resolve(fixture, "scripts/generated/version-packages.js")]);
  const candidates = readJson(".changeset/release.json").packages;
  assert.deepEqual(candidates, expected, "The real version wrapper must record only directly changed and propagated packages, with their independent versions.");
  assert.equal(readFileSync(resolve(fixture, "packages/vue/package.json"), "utf8"), oldVue, "An unrelated adapter must remain unchanged and absent from the candidates.");
  assert.equal(readJson("packages/vite/package.json").dependencies["@vooya/core"], expected[0].version, "The propagated release must retain an exact internal dependency.");
  assert(existsSync(resolve(fixture, ".changeset/pre/core-events.md")), "The real version operation must archive its prerelease entry.");
  assert(!existsSync(resolve(fixture, ".changeset/core-events.md")), "The consumed entry must no longer be pending.");
  for (const candidate of candidates) {
    const directory = candidate.name.slice("@vooya/".length);
    assert.equal(readJson(`packages/${directory}/package.json`).version, candidate.version);
    assert(readFileSync(resolve(fixture, `packages/${directory}/CHANGELOG.md`), "utf8").includes(`## ${candidate.version}\n`));
  }
  commit("fixture version packages");
  assert.equal(git("status", "--porcelain").trim(), "", "Version output should be committed before packing.");
  const changedManifests = git("diff", "--name-only", base, "HEAD", "--", "packages/*/package.json").trim().split("\n").filter(Boolean);
  assert.deepEqual(changedManifests.sort(), ["packages/core/package.json", "packages/vite/package.json"]);

  // Registry discovery is deliberately excluded. Supply the upstream plan
  // shape, then run the production channel adapter and the real official pack
  // command. No publish or publish-plan command is invoked by this fixture.
  const upstream = { version: 1, plan: candidates.map((candidate) => [{ kind: "publish", access: "public", tag: "latest", ...candidate }]) };
  const plan = alphaPublishPlan(upstream, candidates);
  assert.deepEqual(plan.plan.map((group) => group.map((entry) => entry.tag)), [["alpha"], ["alpha"]]);
  writeJson("artifacts/input-plan.json", plan);
  run(process.execPath, [cli, "pack", "--from-publish-plan", resolve(fixture, "artifacts/input-plan.json"), "--out-dir", resolve(fixture, "artifacts/packed")]);
  const packed = readJson("artifacts/packed/publish-plan.json");
  assert.equal(packed.version, 1);
  assert.deepEqual(packed.plan.map((group) => group.map(({ tarball, ...entry }) => entry)), plan.plan, "Official packing must preserve candidate identity, dependency order, access, and the forced alpha channel.");
  for (const entry of packed.plan.flat()) {
    const tarball = resolve(fixture, "artifacts/packed", entry.tarball.path);
    const relativeTarball = relative(resolve(fixture, "artifacts/packed"), tarball);
    assert(!isAbsolute(relativeTarball) && !relativeTarball.startsWith(".."), "Packed artifact must remain inside the output directory.");
    const bytes = readFileSync(tarball);
    assert(bytes.length > 0, `${entry.name}: official pack must emit a tarball.`);
    assert.equal(entry.tarball.integrity, `sha256-${createHash("sha256").update(bytes).digest("base64")}`, "The packed plan must bind the exact tarball bytes.");
    const manifest = JSON.parse(run("tar", ["-xOf", tarball, "package/package.json"]));
    assert.equal(manifest.name, entry.name);
    assert.equal(manifest.version, entry.version);
    if (entry.name === "@vooya/vite") assert.equal(manifest.dependencies["@vooya/core"], expected[0].version);
  }
  assert.equal(readdirSync(resolve(fixture, "artifacts/packed/packages")).length, candidates.length, "No unrelated package may be packed.");
  assert.equal(git("status", "--porcelain").trim(), "", "Packing must not mutate the committed release output.");
  console.log("Release pipeline contract passed: real version wrapper, exact independent candidates, archived changeset, forced alpha plan, official offline pack, and tarball integrity/manifests. No registry or publish command ran.");
} finally {
  rmSync(fixture, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}

function setup() {
  writeJson("package.json", { name: "vooya-release-pipeline-fixture", private: true, type: "module", workspaces: ["packages/*"] });
  write(".gitignore", "node_modules/\nscripts/generated/\nartifacts/\n.npm-cache/\n");
  writeJson(".changeset/config.json", {
    changelog: "@changesets/cli/changelog", commit: false, fixed: [], linked: [],
    access: "public", baseBranch: "main", updateInternalDependencies: "patch", ignore: [], format: false,
  });
  writeJson(".changeset/pre.json", { mode: "pre", tag: "alpha" });
  write(".changeset/core-events.md", '---\n"@vooya/core": patch\n---\n\nPreserve asynchronous event dispatch during component updates.\n');
  for (const [directory, version, dependencies] of [
    ["core", "0.1.0-alpha.12", undefined],
    ["vite", "0.1.0-alpha.23", { "@vooya/core": "0.1.0-alpha.12" }],
    ["vue", "0.1.0-alpha.8", undefined],
  ]) {
    writeJson(`packages/${directory}/package.json`, { name: `@vooya/${directory}`, version, license: "MIT", main: "index.js", ...(dependencies ? { dependencies } : {}) });
    write(`packages/${directory}/index.js`, "export const fixture = true;\n");
    write(`packages/${directory}/CHANGELOG.md`, `# Changelog\n\n## v${version}\n\n- Existing published package history.\n`);
  }
  writeJson("package-lock.json", {
    name: "vooya-release-pipeline-fixture", lockfileVersion: 3,
    packages: { "": { name: "vooya-release-pipeline-fixture", workspaces: ["packages/*"] }, ...Object.fromEntries(["core", "vite", "vue"].map((directory) => [`packages/${directory}`, readJson(`packages/${directory}/package.json`)])) },
  });
  mkdirSync(resolve(fixture, "scripts/generated"), { recursive: true });
  for (const name of ["version-packages.js", "release-model.js"]) copyFileSync(resolve(root, "scripts/generated", name), resolve(fixture, "scripts/generated", name));
  symlinkSync(resolve(root, "node_modules"), resolve(fixture, "node_modules"), process.platform === "win32" ? "junction" : "dir");
}

function write(path, value) {
  const destination = resolve(fixture, path);
  mkdirSync(resolve(destination, ".."), { recursive: true });
  writeFileSync(destination, value);
}

function writeJson(path, value) { write(path, `${JSON.stringify(value, null, 2)}\n`); }
function readJson(path) { return JSON.parse(readFileSync(resolve(fixture, path), "utf8")); }
function git(...args) { return run("git", args); }
function commit(message) {
  git("add", ".");
  git("-c", "user.name=Vooya test", "-c", "user.email=tests@vooya.dev", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", message);
}
function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: fixture, encoding: "utf8", timeout: 120000,
    env: { ...process.env, CI: "true", npm_config_offline: "true", npm_config_ignore_scripts: "true", npm_config_cache: resolve(fixture, ".npm-cache"), npm_config_registry: "http://127.0.0.1:9" },
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${command} ${args.join(" ")}:\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
