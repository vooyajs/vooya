import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readPackedReleasePlan } from "./helpers/packed-release-plan.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const directory = mkdtempSync(resolve(tmpdir(), "vooya-candidate-packs-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
try {
  const { channel, packages } = readPackedReleasePlan(root);
  for (const { manifest } of packages) {
    run(npm, ["pack", "--workspace", manifest.name, "--pack-destination", directory, "--ignore-scripts", "--json"]);
  }
  run(process.execPath, [resolve(root, "tests/registry-consumer.mjs"), "--pack-dir", directory, "--expected-root", root, "--tag", channel]);
} finally {
  rmSync(directory, { recursive: true, force: true });
}
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" && command.endsWith(".cmd") });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Candidate package acceptance failed: ${command} ${args.join(" ")}`);
}
