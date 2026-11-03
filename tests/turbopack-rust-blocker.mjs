import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const fixture = resolve(root, "tests/fixtures/turbopack-rust-blocker");
const project = mkdtempSync(resolve(tmpdir(), "vooya-turbopack-blocker-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

try {
  cpSync(fixture, project, { recursive: true });
  run(npm, ["install", "--ignore-scripts", "--no-audit", "--no-fund"], project);
  const versions = {
    node: process.version,
    next: runCapture(npm, ["exec", "--", "next", "--version"], project).stdout.trim(),
    react: JSON.parse(readFileSync(resolve(project, "node_modules/react/package.json"), "utf8")).version,
  };
  const result = runCapture(npm, ["run", "build"], project);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.notEqual(result.status, 0, "Turbopack unexpectedly accepted loader asset emission.");
  assert.match(output, /vooyaRustEmitFileSentinelLoader/);
  assert.match(output, /emitFile.*unsupported|emitFile is not a function/i);
  assert.equal(existsSync(resolve(project, ".next", "static", "media", "vooya-rust-blocker-sentinel.wasm")), false);
  console.log(`Turbopack rejected loader-side asset emission for a .rs client import as expected (${JSON.stringify(versions)}).`);
} finally {
  if (!process.env.VOOYA_KEEP_TURBOPACK_FIXTURE) rmSync(project, { force: true, recursive: true });
}

function run(command, args, cwd) {
  const result = runCapture(command, args, cwd, "inherit");
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}.`);
}

function runCapture(command, args, cwd, stdio = "pipe") {
  if (process.platform === "win32") {
    return spawnSync("cmd.exe", ["/d", "/s", "/c", [command, ...args].map(quoteWindowsArgument).join(" ")], {
      cwd,
      encoding: "utf8",
      stdio,
    });
  }
  return spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio,
  });
}

function quoteWindowsArgument(value) {
  return /[\s"]/u.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value;
}
