import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
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
  const result = runCapture(npm, ["run", "build"], project);
  assert.notEqual(result.status, 0, "Turbopack unexpectedly accepted loader asset emission.");
  assert.match(`${result.stdout}\n${result.stderr}`, /emitFile.*unsupported|emitFile is not a function/i);
  console.log("Turbopack rejected loader-side asset emission for a .rs client import as expected.");
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
