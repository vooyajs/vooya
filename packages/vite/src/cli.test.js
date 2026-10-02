import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const cli = resolve(import.meta.dirname, "../bin/vooya.mjs");

test("vooya clean removes only generated workspace entries", () => {
  const root = mkdtempSync(resolve(tmpdir(), "vooya-clean-"));
  try {
    mkdirSync(resolve(root, ".vooya/build"), { recursive: true });
    writeFileSync(resolve(root, ".vooya/build/generated.txt"), "generated");
    writeFileSync(resolve(root, ".vooya/keep.txt"), "user-owned");
    const result = spawnSync(process.execPath, [cli, "clean"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Removed generated Vooya state/);
    assert.equal(existsSync(resolve(root, ".vooya/build")), false);
    assert.equal(existsSync(resolve(root, ".vooya/keep.txt")), true);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("vooya clean honors an explicit workspace root", () => {
  const root = mkdtempSync(resolve(tmpdir(), "vooya-clean-"));
  try {
    mkdirSync(resolve(root, ".generated/build"), { recursive: true });
    const result = spawnSync(
      process.execPath,
      [cli, "clean", "--workspace-root", ".generated"],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(resolve(root, ".generated")), false);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("doctor --json emits a parseable failure report without exposing the environment", () => {
  const root = mkdtempSync(resolve(tmpdir(), "vooya-doctor-json-"));
  try {
    const canary = "not-a-real-secret-cli-canary";
    const result = spawnSync(process.execPath, [cli, "doctor", "--json", "--cargo-path", resolve(root, "missing-cargo")], {
      cwd: root, encoding: "utf8", env: { ...process.env, VOOYA_REVIEW_CANARY: canary },
    });
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.equal(report.schemaVersion, 1);
    assert.equal(report.ok, false);
    assert.equal(report.cargo.path, resolve(root, "missing-cargo"));
    assert.equal(result.stdout.includes(canary), false);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("clean rejects --json before removing generated files", () => {
  const root = mkdtempSync(resolve(tmpdir(), "vooya-clean-json-"));
  try {
    mkdirSync(resolve(root, ".vooya/build"), { recursive: true });
    const result = spawnSync(process.execPath, [cli, "clean", "--json"], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /--json is only available for vooya doctor/);
    assert.equal(existsSync(resolve(root, ".vooya/build")), true);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
