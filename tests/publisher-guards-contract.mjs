import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const fixture = mkdtempSync(resolve(tmpdir(), "vooya-publisher-guards-"));
const write = (path, value) => {
  mkdirSync(resolve(fixture, path, ".."), { recursive: true });
  writeFileSync(resolve(fixture, path), typeof value === "string" ? value : JSON.stringify(value));
};
const git = (...args) => {
  const result = spawnSync("git", args, { cwd: fixture, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};
const commit = () => {
  git("add", ".");
  git("-c", "user.name=Vooya test", "-c", "user.email=tests@vooya.dev", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "fixture");
};
try {
  write(".gitignore", "node_modules\nscripts/generated/\n.vooya-tools/\n");
  write("package.json", { private: true, type: "module", scripts: { "verify:release": "node -e \"console.error('FULL_GATE_REQUIRED'); process.exit(42)\"" } });
  write(".changeset/config.json", { access: "public", changelog: "@changesets/cli/changelog", fixed: [], linked: [], ignore: [] });
  write(".changeset/pre.json", { mode: "pre", tag: "alpha" });
  write(".changeset/line.json", { baseVersion: "0.2.0", channel: "alpha", branch: "main" });
  write("packages/core/package.json", { name: "@vooya/core", version: "0.1.0-beta.0" });
  const manifest = { name: "@vooya/vite", version: "0.1.0-beta.2", dependencies: { "@vooya/core": "0.1.0-beta.0" } };
  write("packages/vite/package.json", manifest);
  git("init", "--quiet"); git("checkout", "-b", "main"); commit();
  manifest.version = "0.2.0-alpha.0";
  write("packages/vite/package.json", manifest);
  write(".changeset/release.json", { packages: [{ name: manifest.name, version: manifest.version }] });
  commit();
  const sha = git("rev-parse", "HEAD");
  mkdirSync(resolve(fixture, "scripts/generated"), { recursive: true });
  for (const name of ["publish-alpha", "alpha-publish-plan", "release-channel", "release-model"]) copyFileSync(resolve(root, `scripts/generated/${name}.js`), resolve(fixture, `scripts/generated/${name}.js`));
  symlinkSync(resolve(root, "node_modules"), resolve(fixture, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  const check = (env, expected) => {
    const result = spawnSync(process.execPath, [resolve(fixture, "scripts/generated/publish-alpha.js")], {
      cwd: fixture, encoding: "utf8", timeout: 20000,
      env: { ...process.env, GITHUB_ACTIONS: "false", GITHUB_REF: "", GITHUB_SHA: "", GITHUB_EVENT_NAME: "", VOOYA_RELEASE_SHA: "", npm_config_registry: "http://127.0.0.1:9", npm_config_offline: "true", ...env },
    });
    assert.notEqual(result.status, 0, "Fixture may never publish: its full gate intentionally fails.");
    assert.match(result.stdout + result.stderr, expected);
  };
  git("checkout", "-b", "unreviewed");
  check({}, /reviewed main checkout/);
  const action = { GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REF: "refs/heads/main", GITHUB_SHA: sha, VOOYA_RELEASE_SHA: sha };
  check({ ...action, GITHUB_EVENT_NAME: "push" }, /explicit workflow dispatch/);
  check({ ...action, GITHUB_REF: "refs/heads/release\/0.1" }, /exact HEAD/);
  check({ ...action, VOOYA_RELEASE_SHA: "0".repeat(40) }, /exact HEAD/);
  git("checkout", "main");
  write("unreviewed.txt", "dirty"); check({}, /checkout must be clean/); rmSync(resolve(fixture, "unreviewed.txt"));
  // Both accepted invocation paths must actually execute the mandatory gate.
  check({}, /FULL_GATE_REQUIRED/);
  git("checkout", "--detach", sha); check(action, /FULL_GATE_REQUIRED/);
  console.log("Publisher guards passed: exact mixed-line candidate commit, branch/event/SHA/clean checks and mandatory full gate; no registry or publish call executed.");
} finally { rmSync(fixture, { recursive: true, force: true }); }
