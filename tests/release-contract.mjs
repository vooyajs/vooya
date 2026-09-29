import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const temporaryRoot = mkdtempSync(resolve(tmpdir(), "vooya-release-contract-"));
const releaseVersion = readJson(resolve(root, "packages/core/package.json")).version;

try {
  createFixture();
  runVerifier();
  const publicRegistry = spawnSync(process.execPath, [resolve(root, "scripts/verify-lockfile-registry.mjs"), "--root", temporaryRoot], { encoding: "utf8" });
  if (publicRegistry.status !== 0) throw new Error(publicRegistry.stderr);
  for (const resolved of ["https://registry.internal.invalid/example.tgz", "https://registry.npmjs.org.evil.invalid/example.tgz", "file:../example.tgz", "https://user:secret@registry.npmjs.org/example.tgz"]) {
    const fixture = mkdtempSync(resolve(tmpdir(), "vooya-registry-origin-"));
    try {
      writeJson(resolve(fixture, "package-lock.json"), { packages: { "node_modules/example": { version: "1.0.0", resolved, integrity: "sha512-YQ==" } } });
      const rejected = spawnSync(process.execPath, [resolve(root, "scripts/verify-lockfile-registry.mjs"), "--root", fixture], { encoding: "utf8" });
      if (rejected.status === 0) throw new Error(`Non-public tarball was accepted: ${resolved}`);
    } finally { rmSync(fixture, { force: true, recursive: true }); }
  }
  assertFailure("lockfile workspace version drift", (fixture) => {
    const lockfile = readJson(resolve(fixture, "package-lock.json"));
    lockfile.packages["packages/core"].version = "0.1.0-alpha.3";
    writeJson(resolve(fixture, "package-lock.json"), lockfile);
  }, /workspace entry packages\/core must match/);
  assertFailure("lockfile internal dependency drift", (fixture) => {
    const lockfile = readJson(resolve(fixture, "package-lock.json"));
    lockfile.packages["packages/vite"].dependencies["@vooya/core"] = "0.1.0-alpha.3";
    writeJson(resolve(fixture, "package-lock.json"), lockfile);
  }, new RegExp(`must keep internal dependency @vooya/core@${escapeRegExp(releaseVersion)}`));
  assertFailure("package internal dependency drift", (fixture) => {
    const packageMetadata = readJson(resolve(fixture, "packages/vite/package.json"));
    packageMetadata.dependencies["@vooya/core"] = "^0.1.0-alpha.4";
    writeJson(resolve(fixture, "packages/vite/package.json"), packageMetadata);
  }, /must depend on exact @vooya\/core@/);
  assertChangesetsFailure("empty package-scoped changeset", (fixture) => {
    writeFileSync(resolve(fixture, ".changeset", "empty.md"), `---\n\n---\n\nEmpty release.\n`);
  }, /must name at least one Vooya package|invalid changeset entry/);
  assertChangesetsFailure("unknown package in changeset", (fixture) => {
    writeFileSync(resolve(fixture, ".changeset", "unknown.md"), `---\n"@vooya/unknown": patch\n---\n\nUnknown release.\n`);
  }, /names unknown Vooya package/);
  console.log("Release contract regression checks passed.");
} finally {
  rmSync(temporaryRoot, { force: true, recursive: true });
}

function createFixture() {
  cpSync(resolve(root, "package-lock.json"), resolve(temporaryRoot, "package-lock.json"));
  cpSync(resolve(root, ".changeset/config.json"), resolve(temporaryRoot, ".changeset/config.json"), { recursive: true });
  cpSync(resolve(root, "packages"), resolve(temporaryRoot, "packages"), {
    recursive: true,
    filter(source) {
      return !source.includes("node_modules") && !source.includes(".artifact-build");
    },
  });
}

function assertChangesetsFailure(description, change, expected) {
  const fixture = mkdtempSync(resolve(tmpdir(), "vooya-changesets-contract-case-"));
  try {
    cpSync(temporaryRoot, fixture, { recursive: true });
    change(fixture);
    const output = spawnSync(process.execPath, [resolve(root, "scripts/generated/verify-changesets.js"), "--root", fixture], { encoding: "utf8" });
    if (output.status === 0 || !expected.test(`${output.stdout}\n${output.stderr}`)) {
      throw new Error(`Expected ${description} to fail with ${expected}, got:\n${output.stdout}\n${output.stderr}`);
    }
  } finally {
    rmSync(fixture, { force: true, recursive: true });
  }
}

function assertFailure(description, change, expected) {
  const fixture = mkdtempSync(resolve(tmpdir(), "vooya-release-contract-case-"));
  try {
    cpSync(temporaryRoot, fixture, { recursive: true });
    change(fixture);
    const output = runVerifier(fixture, false);
    if (output.status === 0 || !expected.test(`${output.stdout}\n${output.stderr}`)) {
      throw new Error(`Expected ${description} to fail with ${expected}, got:\n${output.stdout}\n${output.stderr}`);
    }
  } finally {
    rmSync(fixture, { force: true, recursive: true });
  }
}

function runVerifier(fixture = temporaryRoot, throwOnFailure = true) {
  const result = spawnSync(process.execPath, [resolve(root, "scripts/generated/verify-package-versions.js"), "--root", fixture], { encoding: "utf8" });
  if (throwOnFailure && result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
