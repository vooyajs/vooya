import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readReleaseModel } from "./release-model.js";
import { readReleaseLine } from "./release-channel.js";

const root = fileURLToPath(new URL("../..", import.meta.url));
const before = readReleaseModel(root).packages.map(({ manifest }) => ({ name: manifest.name, version: manifest.version }));
const prePath = resolve(root, ".changeset/pre.json");
const pre = existsSync(prePath) ? JSON.parse(readFileSync(prePath, "utf8")) : undefined;
const line = readReleaseLine(root);
const firstBeta = !line && pre?.mode === "pre" && pre.tag === "beta" && before.some(({ version }) => /^0\.1\.0-alpha\.\d+$/.test(version));
if (line) {
  const { readReviewedReleasePlan } = await import("./release-plan.js");
  const { applyReleasePlan } = await import("@changesets/apply-release-plan");
  const { plan, workspace, config } = await readReviewedReleasePlan(root);
  if (plan.releases.length) await applyReleasePlan(plan, workspace, config, undefined, root);
  console.log(`Prepared ${plan.releases.filter((release) => release.type !== "none").length} packages for ${line.baseVersion}-${line.channel}.`);
} else if (firstBeta) {
  if (!before.every(({ version }) => /^0\.1\.0-alpha\.\d+$/.test(version))) throw new Error("The first beta transition requires the entire public package set to be on 0.1.0-alpha.N.");
  await versionFirstBeta();
} else {
  const result = spawnSync(process.execPath, [fileURLToPath(import.meta.resolve("@changesets/cli/bin.js")), "version"], { cwd: root, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const packages = readReleaseModel(root).packages.filter(({ manifest }) => before.find((entry) => entry.name === manifest.name)?.version !== manifest.version).map(({ manifest }) => ({ name: manifest.name, version: manifest.version }));
if (packages.length) writeFileSync(resolve(root, ".changeset/release.json"), `${JSON.stringify({ packages }, null, 2)}\n`);

async function versionFirstBeta() {
  const { readReviewedReleasePlan } = await import("./release-plan.js");
  const { applyReleasePlan } = await import("@changesets/apply-release-plan");
  const { plan, workspace, config } = await readReviewedReleasePlan(root);
  await applyReleasePlan(plan, workspace, config, undefined, root);
  console.log(`Prepared ${plan.releases.length} packages for the first 0.1.0-beta.0 release.`);
}
