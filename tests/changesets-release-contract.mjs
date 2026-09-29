import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("..", import.meta.url));
const cli = require.resolve("@changesets/cli/bin.js");
assert.equal(require("@changesets/cli/package.json").version, "3.0.3", "Revalidate the real release contract before upgrading Changesets.");
const fixture = mkdtempSync(resolve(tmpdir(), "vooya-changesets-release-"));
const initial = new Map();
const firstRelease = new Set(["core", "build-core", "vite", "rspack", "webpack"]);
const secondRelease = new Set(["build-core", "vite", "rspack", "webpack"]);
const namedSummary = "Generate concrete TypeScript interfaces for derived Rust structs and unit enums.";
const scopedSummary = "Resolve named schemas within their source group and conventional Rust module paths.";
const nextSummary = "Preserve exact dependency declarations in the next alpha build.";

try {
  createFixture();
  synchronizeLockfile();
  writeChangeset("named-abi-declarations", ["core", "build-core"], namedSummary);
  writeChangeset("scoped-abi-declarations", ["build-core"], scopedSummary);
  const before = snapshotPackages();
  runChangesets("version");
  synchronizeLockfile();

  const firstVersions = expectedVersions(firstRelease);
  assertVersionsAndDependencies(firstVersions);
  assertReleaseChangelogs(before, firstRelease, firstVersions);
  assertReleaseSummary("core", namedSummary);
  assertReleaseSummary("build-core", namedSummary);
  assertReleaseSummary("build-core", scopedSummary);
  for (const directory of ["vite", "rspack", "webpack"]) {
    const section = currentSection(directory);
    assert(section.includes(`@vooya/build-core@${firstVersions.get("build-core")}`), `${directory}: propagated dependency note is missing.`);
    assert(!section.includes(namedSummary) && !section.includes(scopedSummary), `${directory}: dependency-only releases must not claim direct ABI changes.`);
  }
  assert.deepEqual(readJson(".changeset/pre.json"), { mode: "pre", tag: "alpha" });
  assert.deepEqual(pendingChangesets(), []);
  assert.deepEqual(archivedChangesets(), ["named-abi-declarations.md", "scoped-abi-declarations.md"]);

  const firstSnapshot = snapshotPackages();
  const firstLock = readFileSync(resolve(fixture, "package-lock.json"), "utf8");
  const archivedBefore = archivedChangesets().map((name) => [name, readFileSync(resolve(fixture, ".changeset/pre", name), "utf8")]);
  runChangesets("version");
  assert.deepEqual(snapshotPackages(), firstSnapshot, "Repeating version must not bump packages or duplicate changelog entries.");
  assert.equal(readFileSync(resolve(fixture, "package-lock.json"), "utf8"), firstLock);
  assert.deepEqual(archivedChangesets().map((name) => [name, readFileSync(resolve(fixture, ".changeset/pre", name), "utf8")]), archivedBefore, "Consumed alpha changesets must stay archived exactly once.");

  writeChangeset("next-alpha-build", ["build-core"], nextSummary);
  runChangesets("version");
  synchronizeLockfile();
  const secondVersions = new Map([...firstVersions].map(([directory, version]) => [directory, secondRelease.has(directory) ? nextAlpha(version) : version]));
  assertVersionsAndDependencies(secondVersions);
  assertReleaseChangelogs(firstSnapshot, secondRelease, secondVersions);
  assertReleaseSummary("build-core", nextSummary);
  assert(!currentSection("build-core").includes(namedSummary), "The next alpha must not consume the first alpha's ABI changeset again.");
  assert(!currentSection("build-core").includes(scopedSummary));
  assert.deepEqual(pendingChangesets(), []);
  assert.deepEqual(archivedChangesets(), ["named-abi-declarations.md", "next-alpha-build.md", "scoped-abi-declarations.md"]);

  const beforeStable = snapshotPackages();
  runChangesets("pre", "exit");
  assert.deepEqual(readJson(".changeset/pre.json"), { mode: "exit", tag: "alpha" });
  runChangesets("version");
  synchronizeLockfile();
  const stableVersions = new Map([...initial.keys()].map((directory) => [directory, "0.1.0"]));
  assertVersionsAndDependencies(stableVersions);
  assertReleaseChangelogs(beforeStable, new Set(initial.keys()), stableVersions);
  assertReleaseSummary("core", namedSummary);
  for (const summary of [namedSummary, scopedSummary, nextSummary]) assertReleaseSummary("build-core", summary);
  assert(!existsSync(resolve(fixture, ".changeset/pre.json")), "Finishing the stable release must exit prerelease mode.");
  assert.deepEqual(pendingChangesets(), []);
  assert.deepEqual(archivedChangesets(), [], "Stable release must consume the archived alpha changesets.");
  console.log("Changesets 3.0.3 real-engine release contract passed: independent alphas, two ABI changesets, exact dependencies, offline lockfile sync, changelog history, repeat version, second alpha, and stable 0.1.0 exit.");
} finally {
  rmSync(fixture, { recursive: true, force: true });
}

function createFixture() {
  const sourcePackages = readdirSync(resolve(root, "packages")).sort().flatMap((directory) => {
    const path = resolve(root, "packages", directory, "package.json");
    if (!existsSync(path)) return [];
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    return manifest.private ? [] : [{ directory, manifest }];
  });
  for (const [index, { directory, manifest }] of sourcePackages.entries()) {
    initial.set(directory, { name: manifest.name, version: `0.1.0-alpha.${20 + index * 3}` });
  }
  const versionsByName = new Map([...initial.values()].map(({ name, version }) => [name, version]));
  for (const { directory, manifest } of sourcePackages) {
    // Keep the real internal dependency graph. External dependencies, peer
    // installs and scripts are irrelevant to version planning and need no network.
    const fixtureManifest = { ...initial.get(directory) };
    for (const field of ["dependencies", "optionalDependencies"]) {
      const edges = Object.keys(manifest[field] ?? {}).filter((name) => versionsByName.has(name));
      if (edges.length) fixtureManifest[field] = Object.fromEntries(edges.map((name) => [name, versionsByName.get(name)]));
    }
    writeJson(`packages/${directory}/package.json`, fixtureManifest);
    writeFileSync(resolve(fixture, "packages", directory, "CHANGELOG.md"), `# Changelog\n\n## v${fixtureManifest.version}\n\n- Existing ${fixtureManifest.name} release history.\n`);
  }
  writeJson("package.json", { name: "vooya-release-fixture", private: true, workspaces: ["packages/*"] });
  writeJson(".changeset/config.json", {
    $schema: "https://unpkg.com/@changesets/config@4/schema.json",
    changelog: "@changesets/cli/changelog", commit: false, fixed: [], linked: [],
    access: "public", baseBranch: "main", updateInternalDependencies: "patch", ignore: [], format: false,
  });
  writeJson(".changeset/pre.json", { mode: "pre", tag: "alpha" });
}

function expectedVersions(changed) {
  return new Map([...initial].map(([directory, { version }]) => [directory, changed.has(directory) ? nextAlpha(version) : version]));
}

function nextAlpha(version) {
  const match = /^(\d+\.\d+\.\d+)-alpha\.(\d+)$/.exec(version);
  assert(match, `Expected an alpha version, got ${version}.`);
  return `${match[1]}-alpha.${Number(match[2]) + 1}`;
}

function assertVersionsAndDependencies(expected) {
  const lock = readJson("package-lock.json");
  for (const [directory, version] of expected) {
    const manifest = readJson(`packages/${directory}/package.json`);
    assert.equal(manifest.version, version, `${directory}: version must advance independently.`);
    assert.equal(lock.packages[`packages/${directory}`].version, version);
    for (const field of ["dependencies", "optionalDependencies"]) {
      for (const [name, range] of Object.entries(manifest[field] ?? {})) {
        const dependency = [...initial].find(([, entry]) => entry.name === name)?.[0];
        assert(dependency, `Unexpected external dependency ${name} in isolated fixture.`);
        assert.equal(range, expected.get(dependency), `${directory}: ${name} must use its own exact version.`);
        assert.equal(lock.packages[`packages/${directory}`][field][name], range);
      }
    }
  }
}

function assertReleaseChangelogs(before, changed, expected) {
  for (const directory of initial.keys()) {
    const after = packageSnapshot(directory);
    if (!changed.has(directory)) {
      assert.deepEqual(after, before.get(directory), `${directory}: unrelated package must remain unchanged.`);
      continue;
    }
    assert.equal(after.changelog.match(/^## .+$/m)?.[0], `## ${expected.get(directory)}`);
    const history = before.get(directory).changelog.replace(/^# [^\n]+\n+/, "");
    assert(after.changelog.endsWith(history), `${directory}: existing changelog history must remain byte-for-byte intact.`);
  }
}

function assertReleaseSummary(directory, summary) {
  assert(currentSection(directory).includes(summary), `${directory}: release summary is missing: ${summary}`);
}

function currentSection(directory) {
  const changelog = packageSnapshot(directory).changelog;
  const start = changelog.search(/^## /m);
  const rest = changelog.slice(start + 3);
  const next = rest.search(/^## /m);
  return next < 0 ? changelog.slice(start) : changelog.slice(start, start + 3 + next);
}

function packageSnapshot(directory) {
  return {
    manifest: readFileSync(resolve(fixture, "packages", directory, "package.json"), "utf8"),
    changelog: readFileSync(resolve(fixture, "packages", directory, "CHANGELOG.md"), "utf8"),
  };
}

function snapshotPackages() {
  return new Map([...initial.keys()].map((directory) => [directory, packageSnapshot(directory)]));
}

function pendingChangesets() {
  return readdirSync(resolve(fixture, ".changeset")).filter((name) => name.endsWith(".md")).sort();
}

function archivedChangesets() {
  const directory = resolve(fixture, ".changeset/pre");
  return existsSync(directory) ? readdirSync(directory).filter((name) => name.endsWith(".md")).sort() : [];
}

function writeChangeset(id, packages, summary) {
  writeFileSync(resolve(fixture, ".changeset", `${id}.md`), `---\n${packages.map((directory) => `"${initial.get(directory).name}": patch`).join("\n")}\n---\n\n${summary}\n`);
}

function writeJson(path, value) {
  const target = resolve(fixture, path);
  mkdirSync(resolve(target, ".."), { recursive: true });
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(fixture, path), "utf8"));
}

function runChangesets(...args) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: fixture, encoding: "utf8", env: { ...process.env, CI: "true" } });
  assert.equal(result.status, 0, `changeset ${args.join(" ")}:\n${result.stdout}\n${result.stderr}`);
}

function synchronizeLockfile() {
  const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["install", "--package-lock-only", "--ignore-scripts", "--offline", "--no-audit", "--no-fund"], {
    cwd: fixture, encoding: "utf8", shell: process.platform === "win32",
  });
  assert.equal(result.status, 0, `Offline lockfile synchronization failed:\n${result.stdout}\n${result.stderr}`);
}
