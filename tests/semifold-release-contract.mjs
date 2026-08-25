import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const fixture = mkdtempSync(resolve(tmpdir(), "vooya-semifold-plan-"));

try {
  cpSync(resolve(root, ".changes"), resolve(fixture, ".changes"), { recursive: true });
  cpSync(resolve(root, "packages"), resolve(fixture, "packages"), {
    recursive: true,
    filter(source) {
      return !source.includes("node_modules") && !source.includes(".artifact-build") && !source.includes("dist");
    },
  });
  writeFileSync(resolve(fixture, "package.json"), JSON.stringify({ private: true, workspaces: ["packages/*"] }));
  const currentVersion = JSON.parse(readFileSync(resolve(fixture, "packages/core/package.json"), "utf8")).version;
  const expectedVersion = nextAlphaVersion(currentVersion);
  writeFileSync(resolve(fixture, ".changes", "fixed-group.md"), `---\nvooya-compiler: "patch:chore"\nvooya-core: "patch:chore"\nvooya-build-core: "patch:chore"\nvooya-vite: "patch:chore"\nvooya-vue: "patch:chore"\nvooya-react: "patch:chore"\nvooya-solid: "patch:chore"\nvooya-svelte: "patch:chore"\nvooya-rspack: "patch:chore"\nvooya-webpack: "patch:chore"\n---\n\nVerify Vooya's coordinated release group.\n`);
  const pushEvent = resolve(fixture, "push-event.json");
  writeFileSync(pushEvent, JSON.stringify({ repository: { name: "vooya" } }));
  for (const args of [["init", "--quiet"], ["add", "."], ["-c", "user.name=Vooya test", "-c", "user.email=tests@vooya.dev", "commit", "--quiet", "-m", "fixture"]]) {
    const git = spawnSync("git", args, { cwd: fixture, encoding: "utf8" });
    assert.equal(git.status, 0, git.stderr || git.stdout);
  }

  const result = spawnSync(process.execPath, [resolve(root, "scripts/generated/semifold.js"), "status"], {
    cwd: fixture,
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_ACTIONS: "true",
      GITHUB_EVENT_NAME: "push",
      GITHUB_EVENT_PATH: pushEvent,
    },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /已规划 10 个包|planned 10 package/i);
  for (const id of ["vooya-compiler", "vooya-core", "vooya-build-core", "vooya-vite", "vooya-vue", "vooya-react", "vooya-solid", "vooya-svelte", "vooya-rspack", "vooya-webpack"]) {
    assert.match(output, new RegExp(id));
  }

  const version = spawnSync(process.execPath, [resolve(root, "scripts/generated/semifold.js"), "version", "--dry-run"], {
    cwd: fixture,
    encoding: "utf8",
    env: process.env,
  });
  assert.equal(version.status, 0, version.stderr || version.stdout);
  const versionOutput = `${version.stdout}\n${version.stderr}`;
  for (const id of ["vooya-compiler", "vooya-core", "vooya-build-core", "vooya-vite", "vooya-vue", "vooya-react", "vooya-solid", "vooya-svelte", "vooya-rspack", "vooya-webpack"]) {
    assert.match(versionOutput, new RegExp(id));
  }
  assert.match(versionOutput, new RegExp(escapeRegExp(expectedVersion)));

  const apply = spawnSync(process.execPath, [resolve(root, "scripts/generated/semifold.js"), "version"], {
    cwd: fixture,
    encoding: "utf8",
    env: process.env,
  });
  assert.equal(apply.status, 0, apply.stderr || apply.stdout);
  const lockfile = JSON.parse(readFileSync(resolve(fixture, "package-lock.json"), "utf8"));
  for (const directory of ["compiler", "core", "build-core", "vite", "vue", "react", "solid", "svelte", "rspack", "webpack"]) {
    assert.equal(lockfile.packages[`packages/${directory}`].version, expectedVersion);
  }
  assert.equal(lockfile.packages["packages/vite"].dependencies["@vooya/core"], expectedVersion);
  assert.equal(lockfile.packages["packages/vite"].dependencies["@vooya/compiler"], expectedVersion);
  assert.equal(lockfile.packages["packages/vite"].dependencies["@vooya/build-core"], expectedVersion);
  console.log("Semifold fixed-group status, version dry-run, and lockfile synchronization passed.");
} finally {
  rmSync(fixture, { force: true, recursive: true });
}

function nextAlphaVersion(version) {
  const match = /^(\d+\.\d+\.\d+)-alpha\.(\d+)$/.exec(version);
  assert(match, `Expected an alpha version, got ${version}.`);
  return `${match[1]}-alpha.${Number(match[2]) + 1}`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
