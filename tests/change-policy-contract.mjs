import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("..", import.meta.url));
const verifier = resolve(repository, "scripts/generated/verify-change-policy.js");
const oldVersion = "0.1.0-alpha.9";
const previousRelease = `## v${oldVersion}\n\n### Fixes\n\n- Preserve source diagnostics.\n`;
let count = 0;

check("published source requires a changeset", (fixture) => source(fixture, "core"), /changesets for: @vooya\/core/);
check("correct package changeset", (fixture) => {
  source(fixture, "core");
  changeset(fixture, "@vooya/core");
});
check("another package does not cover source", (fixture) => {
  source(fixture, "core");
  changeset(fixture, "@vooya/vue");
}, /changesets for: @vooya\/core/);
check("base changeset cannot be reused", (fixture) => source(fixture, "core"), /changesets for: @vooya\/core/, (fixture) => changeset(fixture, "@vooya/core"));
check("updated changeset can cover new source", (fixture) => {
  source(fixture, "core");
  changeset(fixture, "@vooya/core", "Preserve asynchronous event dispatch as well.");
}, undefined, (fixture) => changeset(fixture, "@vooya/core"));
check("documentation and tests need no release entry", (fixture) => {
  write(fixture, "docs/guide.md", "Updated example.\n");
  write(fixture, "packages/core/README.md", "Updated setup.\n");
  write(fixture, "packages/core/source/runtime.test.ts", "export const test = true;\n");
  write(fixture, "packages/vue/tests/runtime.ts", "export const fixture = true;\n");
});
check("direct Rust crate source requires core entry", (fixture) => write(fixture, "crates/vooya/src/lib.rs", "pub fn dispatch() {}\n"), /changesets for: @vooya\/core/);
check("Rust macro source requires core entry", (fixture) => write(fixture, "crates/vooya-macros/src/lib.rs", "pub fn derive_event() {}\n"), /changesets for: @vooya\/core/);
check("Rust change with core entry", (fixture) => {
  write(fixture, "crates/vooya/src/lib.rs", "pub fn dispatch() {}\n");
  changeset(fixture, "@vooya/core");
});
check("Rust tests and docs do not require an entry", (fixture) => {
  write(fixture, "crates/vooya/tests/events.rs", "#[test] fn dispatch() {}\n");
  write(fixture, "crates/vooya/README.md", "Updated Rust example.\n");
});
check("source and version changes must be separated", (fixture) => {
  source(fixture, "core");
  bump(fixture);
  changeset(fixture, "@vooya/core");
}, /Separate release version changes/);
check("version-only update retains changelog history", (fixture) => bump(fixture));
check("version update cannot drop old changelog", (fixture) => {
  bump(fixture);
  write(fixture, "packages/core/CHANGELOG.md", "# Changelog\n\n## 0.1.0-alpha.10\n\n- Preserve asynchronous events.\n");
}, /rewrites or removes historical/);
check("external dependency changes require release entry", (fixture) => dependency(fixture), /changesets for: @vooya\/core/);
check("external dependency changes with entry", (fixture) => {
  dependency(fixture);
  changeset(fixture, "@vooya/core");
});
check("invalid syntax cannot hide beside a valid package", (fixture) => write(fixture, ".changeset/change.md", '---\n"@vooya/core": patch\nignored: invalid\n---\n\nPreserve asynchronous events.\n'), /invalid version type/);
check("duplicate package rejected", (fixture) => write(fixture, ".changeset/change.md", '---\n"@vooya/core": patch\n"@vooya/core": minor\n---\n\nPreserve asynchronous events.\n'), /Map keys must be unique/);
check("unknown category rejected", (fixture) => write(fixture, ".changeset/change.md", '---\n"@vooya/core": unknown\n---\n\nPreserve asynchronous events.\n'), /invalid version type/);
check("empty summary rejected", (fixture) => changeset(fixture, "@vooya/core", ""), /must describe the user-visible change/);
check("comment-only summary rejected", (fixture) => changeset(fixture, "@vooya/core", "<!-- Add release details -->"), /must describe the user-visible change/);
check("unknown package rejected", (fixture) => changeset(fixture, "@vooya/other"), /unknown Vooya package/);
check("missing closing frontmatter rejected", (fixture) => write(fixture, ".changeset/change.md", '---\n"@vooya/core": patch\nPreserve asynchronous events.\n'), /missing or invalid frontmatter/);
for (const summary of ["# TODO", "### Fixes", "- TBD"]) {
  check(`placeholder summary rejected: ${summary}`, (fixture) => changeset(fixture, "@vooya/core", summary), /must describe the user-visible change/);
}
console.log(`Change policy contract checks passed (${count} cases).`);

function check(name, mutate, expected, prepare = () => {}) {
  const fixture = mkdtempSync(resolve(tmpdir(), "vooya-change-policy-"));
  try {
    write(fixture, "package.json", JSON.stringify({ private: true, workspaces: ["packages/*"] }));
    write(fixture, "package-lock.json", JSON.stringify({ name: "fixture", lockfileVersion: 3, packages: {} }));
    for (const directory of ["core", "vue"]) {
      write(fixture, `packages/${directory}/package.json`, JSON.stringify({ name: `@vooya/${directory}`, version: oldVersion }));
      write(fixture, `packages/${directory}/CHANGELOG.md`, `# Changelog\n\n${previousRelease}`);
      write(fixture, `packages/${directory}/source/index.ts`, "export const version = 1;\n");
    }
    write(fixture, ".changeset/config.json", JSON.stringify({ access: "public", changelog: "@changesets/cli/changelog", fixed: [], linked: [], ignore: [] }));
    prepare(fixture);
    git(fixture, ["init", "--quiet"]);
    git(fixture, ["add", "."]);
    git(fixture, ["-c", "user.name=Vooya test", "-c", "user.email=tests@vooya.dev", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "fixture"]);
    mutate(fixture);
    // Newly added production files and changesets must participate in the diff.
    git(fixture, ["add", "."]);
    const result = spawnSync(process.execPath, [verifier, "--root", fixture, "--base", "HEAD"], { encoding: "utf8" });
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

function write(fixture, path, value) {
  const destination = resolve(fixture, path);
  mkdirSync(resolve(destination, ".."), { recursive: true });
  writeFileSync(destination, value);
}

function source(fixture, directory) {
  write(fixture, `packages/${directory}/source/index.ts`, "export const version = 2;\n");
}

function changeset(fixture, id, summary = "Preserve asynchronous event dispatch.") {
  write(fixture, ".changeset/change.md", `---\n"${id}": patch\n---\n\n${summary}\n`);
}

function bump(fixture) {
  write(fixture, "packages/core/package.json", JSON.stringify({ name: "@vooya/core", version: "0.1.0-alpha.10" }));
  write(fixture, "packages/core/CHANGELOG.md", `# Changelog\n\n## 0.1.0-alpha.10\n\n- Preserve asynchronous events.\n\n${previousRelease}`);
}

function dependency(fixture) {
  const path = "packages/core/package.json";
  const manifest = JSON.parse(readFileSync(resolve(fixture, path), "utf8"));
  manifest.dependencies = { "event-target-shim": "6.0.2" };
  write(fixture, path, JSON.stringify(manifest));
}

function git(fixture, args) {
  const result = spawnSync("git", args, { cwd: fixture, encoding: "utf8" });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
}
