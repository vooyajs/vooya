import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getPackages } from "@manypkg/get-packages";
import { readConfig } from "@changesets/config";
import { readChangesets } from "@changesets/read";
import { assembleReleasePlan } from "@changesets/assemble-release-plan";
import { readReleaseModel } from "./release-model.js";
import { readReleaseLine, validateReleaseVersion, type ReleaseLine } from "./release-channel.js";
import { createRequire } from "node:module";
// Use the same SemVer implementation as the pinned official planner.
const { gt: semverGt, satisfies: semverSatisfies } = createRequire(import.meta.resolve("@changesets/assemble-release-plan"))("semver");

// Share the exact first-beta policy between the read-only preview and version
// application. Changesets continues to own planning and applying every release.
export async function readReviewedReleasePlan(root: string) {
  const line = readReleaseLine(root);
  const before = readReleaseModel(root).packages.map(({ manifest }) => ({ name: manifest.name, version: manifest.version }));
  const prePath = resolve(root, ".changeset/pre.json");
  const pre = existsSync(prePath) ? JSON.parse(readFileSync(prePath, "utf8")) : undefined;
  const workspace = await getPackages(root);
  const result = await readConfig(root, workspace);
  if (result.errors) throw new Error(result.errors.join("\n"));
  const changesets = await readChangesets(root);
  if (line) {
    for (const changeset of changesets.filter((entry) => !entry.id.startsWith("pre/"))) {
      for (const release of changeset.releases) {
        if (release.type === "major" || (line.channel === "beta" && line.branch.startsWith("release/") && release.type !== "patch")) {
          throw new Error(`Release line ${line.branch} does not permit ${release.type} changesets (${release.name}). Maintenance permits patches only; feature batches must use their reviewed base version.`);
        }
      }
    }
  }
  const plan = assembleReleasePlan(changesets, workspace, result.config, pre);
  const firstBeta = !line && pre?.mode === "pre" && pre.tag === "beta" && before.some(({ version }) => /^0\.1\.0-alpha\.\d+$/.test(version));
  if (firstBeta) {
    if (!before.every(({ version }) => /^0\.1\.0-alpha\.\d+$/.test(version))) throw new Error("The first beta transition requires the entire public package set to be on 0.1.0-alpha.N.");
    const expected = new Set(before.map(({ name }) => name));
    if (plan.releases.length !== expected.size || plan.releases.some((release) => !expected.delete(release.name) || !/^0\.1\.0-beta\.\d+$/.test(release.newVersion ?? "")) || expected.size) {
      throw new Error("The first beta plan must include every public package at base version 0.1.0. Add a changeset for the missing packages; do not edit package versions by hand.");
    }
    // Changesets 3 carries alpha's numeric counter into a different pre tag.
    // Normalize this one transition; the official applier still owns dependency
    // pins, changelogs, package versions and prerelease changeset archives.
    for (const release of plan.releases) release.newVersion = "0.1.0-beta.0";
  }
  if (line) applyLineToPlan(plan, workspace, line);
  return { plan, workspace, config: result.config, firstBeta, line };
}

/** Keep Changesets summaries/application, but review target versions explicitly.
 * Recheck dependents against FINAL versions, not Changesets' old-base guesses.
 */
function applyLineToPlan(plan: ReturnType<typeof assembleReleasePlan>, workspace: Awaited<ReturnType<typeof getPackages>>, line: ReleaseLine): void {
  const packages = new Map(workspace.packages.filter((pkg) => !pkg.packageJson.private).map((pkg) => [pkg.packageJson.name, pkg]));
  const releases = new Map(plan.releases.map((release) => [release.name, release]));
  const target = (oldVersion: string): string => {
    const version = validateReleaseVersion(oldVersion, line.channel, line)
      ? `${line.baseVersion}-${line.channel}.${BigInt(oldVersion.split(".").at(-1)!) + 1n}`
      : `${line.baseVersion}-${line.channel}.0`;
    if (!semverGt(version, oldVersion)) throw new Error(`Release line would not increase ${oldVersion} to ${version}. Choose a newer base/channel instead.`);
    return version;
  };
  for (const release of releases.values()) {
    if (!packages.has(release.name)) throw new Error(`Release line cannot publish private or unknown package ${release.name}.`);
    if (release.type !== "none") release.newVersion = target(release.oldVersion);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, { packageJson: manifest }] of packages) {
      const needsRelease = (["dependencies", "optionalDependencies", "peerDependencies"] as const).some((field) =>
        Object.entries(manifest[field] ?? {}).some(([dependency, range]) => {
          const release = releases.get(dependency);
          return release?.type !== "none" && release?.newVersion
            && !semverSatisfies(release.newVersion, String(range));
        }));
      if (needsRelease && (!releases.has(name) || releases.get(name)?.type === "none")) {
        releases.set(name, { name, type: "patch", oldVersion: manifest.version, newVersion: target(manifest.version), changesets: [] });
        changed = true;
      }
    }
  }
  // A new public package must receive an explicit first-release changeset;
  // otherwise the dependency graph could contain an unpublished 0.0.0 package.
  if ([...releases.values()].some((release) => release.type !== "none")) {
    for (const [name, { packageJson: manifest }] of packages) {
      const directlyChanged = plan.changesets.some((changeset) => !changeset.id.startsWith("pre/") && changeset.releases.some((release) => release.name === name && release.type !== "none"));
      if (manifest.version === "0.0.0" && !directlyChanged) {
        throw new Error(`New package ${name} needs an explicit first-release changeset for ${line.baseVersion}-${line.channel}.0.`);
      }
    }
  }
  plan.releases = [...releases.values()];
}
