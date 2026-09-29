import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const verifier = resolve(root, "scripts/generated/verify-changelogs.js");
let count = 0;
const history = "# Changelog\n\n## v0.1.0-alpha.9\n\n### Fixes\n\n- Preserve source diagnostics.\n";

check("independent versions and private packages", (fixture) => {
  writePackage(fixture, "adapter", "2.4.0", "# Changelog\n\n## 2.4.0\n\n- Add typed events.\n");
  writePackage(fixture, "private", "invalid", undefined, true);
});
check("missing exact version", (fixture) => writePackage(fixture, "core", "0.1.0-alpha.10", history), /missing the exact current version/);
check("empty section", (fixture) => writeChangelog(fixture, "# Changelog\n\n## v0.1.0-alpha.9\n\n### Fixes\n\n<!-- TODO add release summary -->\n- TBD\n"), /real summary/);
check("duplicate section", (fixture) => writeChangelog(fixture, history + "\n## 0.1.0-alpha.9\n\n- Duplicate.\n"), /duplicates release/);
check("current version is not newest", (fixture) => writeChangelog(fixture, "## 0.1.0-alpha.10\n\n- Future.\n\n" + history), /must be the first release/);
check("numeric prerelease invalid", (fixture) => writePackage(fixture, "core", "0.1.0-alpha.09", history), /Invalid numeric prerelease/);
check("numeric prerelease advances 9 to 10", (fixture) => bump(fixture, "0.1.0-alpha.10"), undefined, true);
check("stable follows prerelease", (fixture) => bump(fixture, "0.1.0"), undefined, true);
check("CRLF history preserved", (fixture) => {
  bump(fixture, "0.1.0-alpha.10");
  writeChangelog(fixture, readFileSync(resolve(fixture, "packages/core/CHANGELOG.md"), "utf8").replace(/\n/g, "\r\n"));
}, undefined, true);
check("unchanged package history retained", () => {}, undefined, true);
check("downgrade rejected", (fixture) => bump(fixture, "0.1.0-alpha.8"), /version must increase/, true);
check("metadata-only version rejected", (fixture) => bump(fixture, "0.1.0-alpha.9+rebuilt"), /version must increase/, true);
check("edited previous summary rejected", (fixture) => {
  bump(fixture, "0.1.0-alpha.10");
  writeChangelog(fixture, readFileSync(resolve(fixture, "packages/core/CHANGELOG.md"), "utf8").replace("Preserve source diagnostics", "Invent historical behavior"));
}, /rewrites or removes historical/, true);
check("deleted previous release rejected", (fixture) => writePackage(fixture, "core", "0.1.0-alpha.10", "# Changelog\n\n## 0.1.0-alpha.10\n\n- Add typed events.\n"), /rewrites or removes historical/, true);
check("editing history without a bump rejected", (fixture) => writeChangelog(fixture, history.replace("source diagnostics", "different history")), /rewrites or removes historical/, true);
check("invented historical release rejected", (fixture) => {
  bump(fixture, "0.1.0-alpha.10");
  writeChangelog(fixture, readFileSync(resolve(fixture, "packages/core/CHANGELOG.md"), "utf8") + "\n## 0.1.0-alpha.8\n\n- Invented old release.\n");
}, /adds unrecorded historical/, true);
const olderRelease = "## v0.1.0-alpha.8\n\n- Keep adapter event cleanup.\n";
check("historical release order preserved", (fixture) => {
  writePackage(fixture, "core", "0.1.0-alpha.10", `# Changelog\n\n## 0.1.0-alpha.10\n\n- Add typed events.\n\n${olderRelease}\n${history.slice("# Changelog\n\n".length)}`);
}, /reorders historical/, true, `${history}\n${olderRelease}`);
check("invalid base rejected", (fixture) => {
  const result = spawnSync(process.execPath, [verifier, "--root", fixture, "--base", "missing-base"], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /git rev-parse failed/);
}, undefined, true);
check("new package allowed", (fixture) => writePackage(fixture, "new", "0.1.0", "# Changelog\n\n## 0.1.0\n\n- Initial adapter release.\n"), undefined, true);
console.log(`Changelog contract checks passed (${count} cases).`);

function check(name, mutate, expected, compareBase = false, initialHistory = history) {
  const fixture = mkdtempSync(resolve(tmpdir(), "vooya-changelog-contract-"));
  try {
    writePackage(fixture, "core", "0.1.0-alpha.9", initialHistory);
    if (compareBase) {
      git(fixture, ["init", "--quiet"]);
      git(fixture, ["add", "."]);
      git(fixture, ["-c", "user.name=Vooya test", "-c", "user.email=tests@vooya.dev", "commit", "--quiet", "-m", "fixture"]);
    }
    mutate(fixture);
    const result = spawnSync(process.execPath, [verifier, "--root", fixture, ...(compareBase ? ["--base", "HEAD"] : [])], { encoding: "utf8" });
    if (result.error) throw result.error;
    const output = `${result.stdout}\n${result.stderr}`;
    if (expected) {
      assert.notEqual(result.status, 0, `${name} unexpectedly passed`);
      assert.match(output, expected, name);
    } else {
      assert.equal(result.status, 0, `${name}: ${output}`);
    }
    count++;
  } finally {
    rmSync(fixture, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

function writePackage(fixture, directory, version, changelog, isPrivate = false) {
  const path = resolve(fixture, "packages", directory);
  mkdirSync(path, { recursive: true });
  writeFileSync(resolve(path, "package.json"), JSON.stringify({ name: `@vooya/${directory}`, version, ...(isPrivate ? { private: true } : {}) }));
  if (changelog !== undefined) writeFileSync(resolve(path, "CHANGELOG.md"), changelog);
}

function writeChangelog(fixture, content) {
  writeFileSync(resolve(fixture, "packages/core/CHANGELOG.md"), content);
}

function bump(fixture, version) {
  writePackage(fixture, "core", version, `# Changelog\n\n## ${version}\n\n### Fixes\n\n- Generate typed event declarations.\n\n${history.slice("# Changelog\n\n".length)}`);
}

function git(fixture, args) {
  const result = spawnSync("git", args, { cwd: fixture, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}
