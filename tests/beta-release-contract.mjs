import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseChangesetFile } from "@changesets/parse";

const root = fileURLToPath(new URL("..", import.meta.url));
const fixture = mkdtempSync(resolve(tmpdir(), "vooya-beta-transition-"));
const names = new Map();
const history = new Map();
const initialVersions = new Map();
try {
  // Replay the actual first-beta cohort, not packages introduced after beta.0.
  // New adapters/toolchains must not invent alpha history to join this rehearsal.
  // Omit external dependencies to stay offline.
  cpSync(resolve(root, ".changeset"), resolve(fixture, ".changeset"), { recursive: true });
  const betaNote = resolve(fixture, ".changeset/first-source-author-beta.md");
  if (!existsSync(betaNote)) {
    const consumed = resolve(fixture, ".changeset/pre/first-source-author-beta.md");
    assert(existsSync(consumed), "Keep the first-beta changeset or its prerelease archive for rehearsal.");
    cpSync(consumed, betaNote);
    rmSync(consumed);
  }
  const cohort = new Set(parseChangesetFile(readFileSync(betaNote, "utf8")).releases.map(({ name }) => name));
  // Current work may reference packages that did not exist in the historical graph.
  for (const name of readdirSync(resolve(fixture, ".changeset"))) {
    if (name.endsWith(".md") && !["README.md", "first-source-author-beta.md"].includes(name)) {
      rmSync(resolve(fixture, ".changeset", name));
    }
  }
  writeJson(".changeset/pre.json", { mode: "pre", tag: "beta" });
  writeJson("package.json", { name: "vooya-beta-fixture", private: true, type: "module", workspaces: ["packages/*"] });
  for (const directory of readdirSync(resolve(root, "packages"))) {
    const path = resolve(root, "packages", directory, "package.json");
    if (!existsSync(path)) continue;
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    if (manifest.private || !cohort.has(manifest.name)) continue;
    names.set(manifest.name, directory);
    const changelog = readFileSync(resolve(root, "packages", directory, "CHANGELOG.md"), "utf8");
    const alpha = /^## v?(0\.1\.0-alpha\.\d+)\s*$/m.exec(changelog);
    assert(alpha, `${manifest.name}: the transition rehearsal needs published alpha history.`);
    initialVersions.set(manifest.name, alpha[1]);
    history.set(directory, `${changelog.slice(0, changelog.search(/^## /m))}${changelog.slice(alpha.index)}`);
  }
  assert.deepEqual([...names.keys()].sort(), [...cohort].sort(), "Every historical beta package must remain in the rehearsal.");
  for (const [name, directory] of names) {
    const source = JSON.parse(readFileSync(resolve(root, "packages", directory, "package.json"), "utf8"));
    const manifest = { name, version: initialVersions.get(name) };
    for (const field of ["dependencies", "optionalDependencies"]) {
      const entries = Object.entries(source[field] ?? {}).filter(([dependency]) => names.has(dependency));
      if (entries.length) manifest[field] = Object.fromEntries(entries.map(([dependency]) => [dependency, initialVersions.get(dependency)]));
    }
    writeJson(`packages/${directory}/package.json`, manifest);
    writeFileSync(resolve(fixture, "packages", directory, "CHANGELOG.md"), history.get(directory));
  }
  cpSync(resolve(root, "scripts/generated"), resolve(fixture, "scripts/generated"), { recursive: true });
  symlinkSync(resolve(root, "node_modules"), resolve(fixture, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  // An earlier alpha's consumed summary must survive the channel change, but
  // must not be presented as a new beta change or consumed twice.
  const archived = '---\n"@vooya/core": patch\n---\n\nRetain the previously published alpha summary.\n';
  mkdirSync(resolve(fixture, ".changeset/pre"), { recursive: true });
  writeFileSync(resolve(fixture, ".changeset/pre/earlier-alpha.md"), archived);
  rmSync(resolve(fixture, ".changeset/release.json"), { force: true });
  const pending = readdirSync(resolve(fixture, ".changeset")).filter((name) => name.endsWith(".md") && name !== "README.md");
  const pendingSources = new Map(pending.map((name) => [name, readFileSync(resolve(fixture, ".changeset", name), "utf8")]));
  assert(pending.includes("first-source-author-beta.md"), "First beta must explicitly include its recorded package cohort.");
  synchronizeLockfile();
  const before = snapshot();
  const preview = spawnSync(process.execPath, [resolve(fixture, "scripts/generated/release-status.js")], { cwd: fixture, encoding: "utf8" });
  assert.equal(preview.status, 0, preview.stderr);
  for (const [name, version] of initialVersions) assert(preview.stdout.includes(`${name}: ${version} -> 0.1.0-beta.0`), `${name}: preview must match the actual first-beta plan.`);
  assert.deepEqual(snapshot(), before, "Release preview must not modify any file.");
  const note = readFileSync(betaNote, "utf8");
  rmSync(betaNote);
  const incomplete = spawnSync(process.execPath, [resolve(fixture, "scripts/generated/version-packages.js")], { cwd: fixture, encoding: "utf8" });
  assert.notEqual(incomplete.status, 0, "An incomplete first-beta cohort must be rejected.");
  assert.deepEqual(snapshot(), before, "Reject an incomplete cohort before writing any package, changelog, candidate or lockfile.");
  writeFileSync(betaNote, note);
  version();
  synchronizeLockfile();
  assertPackages(new Map([...names.keys()].map((name) => [name, "0.1.0-beta.0"])));
  const candidates = readJson(".changeset/release.json").packages;
  assert.deepEqual(candidates.map(({ name }) => name).sort(), [...names.keys()].sort());
  assert(candidates.every(({ version }) => version === "0.1.0-beta.0"));
  for (const [name, directory] of names) {
    const changelog = readFileSync(resolve(fixture, "packages", directory, "CHANGELOG.md"), "utf8");
    assert.equal(changelog.match(/^## .+$/m)?.[0], "## 0.1.0-beta.0", name);
    assert(changelog.split(/^## /m)[1].includes("Prepare the first 0.1 beta package set for Rust-file authoring."), `${name}: first-beta release summary is missing.`);
    assert(changelog.endsWith(history.get(directory).slice(history.get(directory).search(/^## /m))), `${name}: published history changed.`);
    assert(!changelog.split(/^## /m)[1].includes("Retain the previously published alpha summary."), "Archived alpha notes must not be duplicated into beta.");
  }
  assert.equal(readFileSync(resolve(fixture, ".changeset/pre/earlier-alpha.md"), "utf8"), archived);
  for (const name of pending) {
    assert(!existsSync(resolve(fixture, ".changeset", name)));
    assert(existsSync(resolve(fixture, ".changeset/pre", name)));
    assert.equal(readFileSync(resolve(fixture, ".changeset/pre", name), "utf8"), pendingSources.get(name), `${name}: consumed changeset text changed.`);
  }
  const first = snapshot();
  version();
  synchronizeLockfile();
  assert.deepEqual(snapshot(), first, "Repeating the beta version step must be a no-op, including its candidate file.");

  // Subsequent beta releases remain independent: changing an adapter must not
  // bump unrelated packages merely because the first beta was coordinated.
  writeFileSync(resolve(fixture, ".changeset/next-vue-beta.md"), '---\n"@vooya/vue": patch\n---\n\nImprove the Vue beta adapter.\n');
  version();
  synchronizeLockfile();
  const next = new Map([...names.keys()].map((name) => [name, name === "@vooya/vue" ? "0.1.0-beta.1" : "0.1.0-beta.0"]));
  assertPackages(next);
  assert.deepEqual(readJson(".changeset/release.json").packages, [{ name: "@vooya/vue", version: "0.1.0-beta.1" }]);
  console.log(`Real Changesets beta rehearsal passed for ${names.size} packages: alpha -> beta.0, exact pins/lockfile, historical notes, consumed summaries, idempotent replay and independent beta.1.`);
} finally {
  rmSync(fixture, { recursive: true, force: true });
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: fixture, encoding: "utf8", env: { ...process.env, CI: "true" }, shell: process.platform === "win32" && command.endsWith(".cmd") });
  assert.equal(result.status, 0, `${command} ${args.join(" ")}:\n${result.stdout}\n${result.stderr}`);
}
function version() { run(process.execPath, [resolve(fixture, "scripts/generated/version-packages.js")]); }
function synchronizeLockfile() { run(process.platform === "win32" ? "npm.cmd" : "npm", ["install", "--package-lock-only", "--ignore-scripts", "--offline", "--no-audit", "--no-fund"]); }
function readJson(path) { return JSON.parse(readFileSync(resolve(fixture, path), "utf8")); }
function writeJson(path, value) {
  const target = resolve(fixture, path);
  mkdirSync(resolve(target, ".."), { recursive: true });
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}
function assertPackages(expected) {
  const lock = readJson("package-lock.json");
  for (const [name, directory] of names) {
    const manifest = readJson(`packages/${directory}/package.json`);
    assert.equal(manifest.version, expected.get(name), name);
    assert.equal(lock.packages[`packages/${directory}`].version, expected.get(name));
    for (const field of ["dependencies", "optionalDependencies"]) for (const [dependency, version] of Object.entries(manifest[field] ?? {})) {
      assert.equal(version, expected.get(dependency));
      assert.equal(lock.packages[`packages/${directory}`][field][dependency], version);
    }
  }
}
function snapshot() {
  const paths = ["package-lock.json", ".changeset/release.json", ".changeset/pre.json", ...[...names.values()].flatMap((directory) => [`packages/${directory}/package.json`, `packages/${directory}/CHANGELOG.md`])];
  return paths.map((path) => [path, existsSync(resolve(fixture, path)) ? readFileSync(resolve(fixture, path), "utf8") : null]);
}
