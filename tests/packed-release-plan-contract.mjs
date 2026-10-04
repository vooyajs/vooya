import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import { readPackedReleasePlan } from "./helpers/packed-release-plan.mjs";

function fixture(run) {
  const root = mkdtempSync(resolve(tmpdir(), "vooya-packed-plan-"));
  const write = (path, value) => { mkdirSync(resolve(root, path, ".."), { recursive: true }); writeFileSync(resolve(root, path), JSON.stringify(value)); };
  write(".changeset/config.json", { access: "public", changelog: "@changesets/cli/changelog", fixed: [], linked: [], ignore: [] });
  write(".changeset/pre.json", { mode: "pre", tag: "alpha" });
  write(".changeset/line.json", { baseVersion: "0.2.0", channel: "alpha", branch: "main" });
  write(".changeset/release.json", { packages: [{ name: "@vooya/vite", version: "0.2.0-alpha.0" }] });
  write("packages/core/package.json", { name: "@vooya/core", version: "0.1.0-beta.0" });
  write("packages/vite/package.json", { name: "@vooya/vite", version: "0.2.0-alpha.0", dependencies: { "@vooya/core": "0.1.0-beta.0" } });
  try { run(root, write); } finally { rmSync(root, { recursive: true, force: true }); }
}

test("packed acceptance keeps the unchanged beta dependency in the alpha graph", () => fixture((root) => {
  const plan = readPackedReleasePlan(root);
  assert.equal(plan.channel, "alpha");
  assert.deepEqual(plan.packages.map(({ manifest }) => manifest.version), ["0.1.0-beta.0", "0.2.0-alpha.0"]);
}));
for (const [label, candidates] of [
  ["stale candidate", [{ name: "@vooya/vite", version: "0.2.0-alpha.1" }]],
  ["wrong line", [{ name: "@vooya/core", version: "0.1.0-beta.0" }]],
  ["unknown package", [{ name: "@vooya/missing", version: "0.2.0-alpha.0" }]],
  ["duplicate candidates", Array(2).fill({ name: "@vooya/vite", version: "0.2.0-alpha.0" })],
  ["empty candidates", []],
]) test(`packed acceptance rejects ${label}`, () => fixture((root, write) => {
  write(".changeset/release.json", { packages: candidates });
  assert.throws(() => readPackedReleasePlan(root), /packed release candidate/);
}));
test("packed acceptance rejects drift in exact internal pins", () => fixture((root, write) => {
  write("packages/vite/package.json", { name: "@vooya/vite", version: "0.2.0-alpha.0", dependencies: { "@vooya/core": "0.1.0-beta.1" } });
  assert.throws(() => readPackedReleasePlan(root), /must depend on exact/);
}));
test("packed acceptance rejects an unversioned new package", () => fixture((root, write) => {
  write("packages/new/package.json", { name: "@vooya/new", version: "0.0.0" });
  assert.throws(() => readPackedReleasePlan(root), /Unsupported packed dependency/);
}));
