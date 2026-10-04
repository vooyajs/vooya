import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
const { satisfies } = createRequire(import.meta.resolve("@changesets/assemble-release-plan"))("semver");
import { readReviewedReleasePlan } from "../scripts/generated/release-plan.js";
import { readReleaseChannel, readReleaseLine, validateReleaseVersion } from "../scripts/generated/release-channel.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const temporary = mkdtempSync(resolve(tmpdir(), "vooya-release-lines-"));
const config = JSON.parse(readFileSync(resolve(root, ".changeset/config.json"), "utf8"));
const read = (directory, path) => JSON.parse(readFileSync(resolve(directory, path), "utf8"));
const write = (directory, path, value) => {
  mkdirSync(resolve(directory, path, ".."), { recursive: true });
  writeFileSync(resolve(directory, path), typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`);
};
function fixture(name, line, packages) {
  const directory = resolve(temporary, name);
  write(directory, "package.json", { name: "vooya-line-fixture", private: true, type: "module", workspaces: ["packages/*"] });
  write(directory, "package-lock.json", { name: "vooya-line-fixture", lockfileVersion: 3, packages: {} });
  write(directory, ".changeset/config.json", { ...config, baseBranch: line.branch });
  write(directory, ".changeset/pre.json", { mode: "pre", tag: line.channel });
  write(directory, ".changeset/line.json", line);
  for (const [short, version, dependencies = {}, peerDependencies = {}] of packages) {
    write(directory, `packages/${short}/package.json`, { name: `@vooya/${short}`, version, dependencies, peerDependencies });
    write(directory, `packages/${short}/CHANGELOG.md`, `# @vooya/${short}\n\n## ${version}\n\nPrevious history for ${short}.\n`);
  }
  cpSync(resolve(root, "scripts/generated"), resolve(directory, "scripts/generated"), { recursive: true });
  symlinkSync(resolve(root, "node_modules"), resolve(directory, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  return directory;
}
function changeset(directory, name, entries, summary) {
  write(directory, `.changeset/${name}.md`, `---\n${entries.map(([name, type]) => `"@vooya/${name}": ${type}`).join("\n")}\n---\n\n${summary}\n`);
}
function version(directory) {
  const result = spawnSync(process.execPath, [resolve(directory, "scripts/generated/version-packages.js")], { cwd: directory, encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
}
const feature = { baseVersion: "0.2.0", channel: "alpha", branch: "main" };
try {
  const directory = fixture("feature", feature, [
    ["core", "0.1.0-beta.0"],
    ["provider-rust", "0.0.0", { "@vooya/core": "0.1.0-beta.0" }],
    ["preset", "0.0.0"],
    ["octane", "0.0.0"],
    ["build-core", "0.1.0-beta.0", { "@vooya/provider-rust": "0.0.0" }],
    ["vite", "0.1.0-beta.2", { "@vooya/build-core": "0.1.0-beta.0" }],
    ["vue", "0.1.0-beta.1"],
    ["peer-host", "0.1.0-beta.0", {}, { "@vooya/vue": ">=0.1.0-beta.0 <0.2.0-0" }],
  ]);
  const archive = '---\n"@vooya/core": patch\n---\n\nOld consumed 0.1 notes.\n';
  write(directory, ".changeset/pre/old.md", archive);
  changeset(directory, "feature", [["provider-rust", "minor"], ["preset", "minor"], ["octane", "minor"], ["vue", "minor"]], "Frozen 0.2 feature batch.");
  const before = await readReviewedReleasePlan(directory);
  const versions = Object.fromEntries(before.plan.releases.filter((release) => release.type !== "none").map((release) => [release.name, release.newVersion]));
  assert.equal(versions["@vooya/core"], undefined);
  for (const name of ["provider-rust", "preset", "octane", "build-core", "vite", "vue", "peer-host"]) assert.equal(versions[`@vooya/${name}`], "0.2.0-alpha.0", name);
  version(directory);
  assert.equal(read(directory, "packages/core/package.json").version, "0.1.0-beta.0");
  assert.equal(read(directory, "packages/provider-rust/package.json").dependencies["@vooya/core"], "0.1.0-beta.0");
  assert.equal(read(directory, "packages/build-core/package.json").dependencies["@vooya/provider-rust"], "0.2.0-alpha.0");
  assert.equal(read(directory, "packages/vite/package.json").dependencies["@vooya/build-core"], "0.2.0-alpha.0");
  assert(satisfies("0.2.0-alpha.0", read(directory, "packages/peer-host/package.json").peerDependencies["@vooya/vue"]));
  assert.equal(readFileSync(resolve(directory, ".changeset/pre/old.md"), "utf8"), archive);
  const changelog = readFileSync(resolve(directory, "packages/vue/CHANGELOG.md"), "utf8");
  assert(changelog.includes("## 0.2.0-alpha.0"));
  assert(changelog.includes("Previous history for vue."));
  assert(!changelog.includes("Old consumed 0.1 notes."));
  const releaseFile = readFileSync(resolve(directory, ".changeset/release.json"), "utf8");
  assert.equal(read(directory, ".changeset/release.json").packages.length, 7);
  assert.equal((await readReviewedReleasePlan(directory)).plan.releases.length, 0);
  version(directory);
  assert.equal(readFileSync(resolve(directory, ".changeset/release.json"), "utf8"), releaseFile);
  assert.equal(readFileSync(resolve(directory, "packages/vue/CHANGELOG.md"), "utf8"), changelog);
  changeset(directory, "fix", [["vue", "patch"]], "Fix the next alpha without consuming old notes.");
  version(directory);
  assert.equal(read(directory, "packages/vue/package.json").version, "0.2.0-alpha.1");
  assert.equal(read(directory, "packages/core/package.json").version, "0.1.0-beta.0");

  const maintenance = fixture("maintenance", { baseVersion: "0.1.0", channel: "beta", branch: "release/0.1" }, [
    ["core", "0.1.0-beta.0"], ["compiler", "0.1.0-beta.0"],
    ["build-core", "0.1.0-beta.0", { "@vooya/core": "0.1.0-beta.0", "@vooya/compiler": "0.1.0-beta.0" }],
    ["vite", "0.1.0-beta.2", { "@vooya/build-core": "0.1.0-beta.0" }],
    ["rspack", "0.1.0-beta.0", { "@vooya/build-core": "0.1.0-beta.0" }],
    ["webpack", "0.1.0-beta.0", { "@vooya/build-core": "0.1.0-beta.0" }],
    ["vue", "0.1.0-beta.1"], ["react", "0.1.0-beta.2"],
    ["solid", "0.1.0-beta.2"], ["svelte", "0.1.0-beta.2"],
  ]);
  changeset(maintenance, "fix", [["react", "patch"], ["build-core", "patch"]], "Report synchronous Store errors and normalize Rust roots.");
  version(maintenance);
  assert.equal(read(maintenance, "packages/react/package.json").version, "0.1.0-beta.3");
  assert.equal(read(maintenance, "packages/build-core/package.json").version, "0.1.0-beta.1");
  for (const name of ["vite", "rspack", "webpack"]) {
    assert.equal(read(maintenance, `packages/${name}/package.json`).version, name === "vite" ? "0.1.0-beta.3" : "0.1.0-beta.1");
    assert.equal(read(maintenance, `packages/${name}/package.json`).dependencies["@vooya/build-core"], "0.1.0-beta.1");
  }
  assert.equal(read(maintenance, ".changeset/release.json").packages.length, 5);
  version(maintenance);
  assert.equal(read(maintenance, "packages/react/package.json").version, "0.1.0-beta.3");

  for (const type of ["minor", "major"]) {
    changeset(maintenance, `invalid-${type}`, [["react", type]], "Features cannot enter maintenance.");
    await assert.rejects(readReviewedReleasePlan(maintenance), /does not permit/);
    rmSync(resolve(maintenance, `.changeset/invalid-${type}.md`));
  }
  const indirectNew = fixture("indirect-new", feature, [["core", "0.1.0-beta.0"], ["new", "0.0.0", { "@vooya/core": "0.1.0-beta.0" }]]);
  changeset(indirectNew, "fix", [["core", "patch"]], "A dependency bump is not a first-package approval.");
  await assert.rejects(readReviewedReleasePlan(indirectNew), /explicit first-release changeset/);

  const backwards = fixture("backwards", { baseVersion: "0.1.0", channel: "alpha", branch: "main" }, [["react", "0.1.0-beta.2"]]);
  changeset(backwards, "fix", [["react", "patch"]], "Cannot downgrade channel precedence.");
  await assert.rejects(readReviewedReleasePlan(backwards), /would not increase/);
  const newer = fixture("newer", feature, [["core", "0.3.0-alpha.0"]]);
  changeset(newer, "fix", [["core", "patch"]], "Cannot downgrade numeric versions.");
  await assert.rejects(readReviewedReleasePlan(newer), /would not increase/);
  const missing = fixture("missing", feature, [["react", "0.1.0-beta.2"], ["new", "0.0.0"]]);
  changeset(missing, "fix", [["react", "patch"]], "New packages need an explicit first version.");
  await assert.rejects(readReviewedReleasePlan(missing), /explicit first-release changeset/);
  for (const invalid of [{ ...feature, baseVersion: "0.2.1" }, { ...feature, branch: "release/../0.1" }, { ...feature, channel: "stable" }, { ...feature, typo: true }]) {
    write(backwards, ".changeset/line.json", invalid);
    assert.throws(() => readReleaseLine(backwards), /Invalid release line/);
  }
  write(backwards, ".changeset/line.json", { ...feature, channel: "beta" });
  assert.throws(() => readReleaseChannel(backwards), /must match/);
  const metadata = spawnSync(process.execPath, [resolve(backwards, "scripts/generated/verify-changesets.js")], { cwd: backwards, encoding: "utf8" });
  assert.notEqual(metadata.status, 0, "Metadata verification must reject line/pre mismatch before publication.");
  assert.match(metadata.stderr, /must match/);
  assert(validateReleaseVersion("0.2.0-alpha.0", "alpha", feature));
  assert(!validateReleaseVersion("0.1.0-alpha.0", "alpha", feature));
  assert(!validateReleaseVersion("0.2.0-alpha.01", "alpha", feature));
  assert(validateReleaseVersion("0.1.0-beta.2", "beta"));
  assert(!validateReleaseVersion("0.2.0-beta.0", "beta"));
  console.log("Release-line contract passed: target versions, new packages, dependency closure, archive/history, repeated application, maintenance and invalid transitions.");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
