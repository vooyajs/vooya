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

test("vooya doctor reports precompiled mode without probing Rust", () => {
  const root = mkdtempSync(resolve(tmpdir(), "vooya-doctor-precompiled-"));
  try {
    const result = spawnSync(process.execPath, [cli, "doctor", "--mode", "precompiled", "--json"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.mode, "precompiled");
    assert.equal(report.ok, true);
    assert.match(report.results[0].detail, /not required/);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("vooya doctor rejects unimplemented managed mode", () => {
  const root = mkdtempSync(resolve(tmpdir(), "vooya-doctor-managed-"));
  try {
    const result = spawnSync(process.execPath, [cli, "doctor", "--mode=managed", "--json"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.equal(report.mode, "managed");
    assert.equal(report.ok, false);
    assert.match(report.results[0].detail, /not supported yet/);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
