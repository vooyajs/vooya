import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readReleaseChannel, readReleaseLine, validateReleaseVersion } from "../../scripts/generated/release-channel.js";
import { readReleaseModel } from "../../scripts/generated/release-model.js";

// Pack the complete dependency graph for consumer acceptance, but require the
// selected release channel only for packages that are actually being released.
export function readPackedReleasePlan(root) {
  const channel = readReleaseChannel(root);
  const line = readReleaseLine(root);
  const { packages, byName } = readReleaseModel(root);
  const candidates = JSON.parse(readFileSync(resolve(root, ".changeset/release.json"), "utf8")).packages;
  if (!Array.isArray(candidates) || !candidates.length || candidates.some((entry) => !entry || typeof entry.name !== "string")
      || new Set(candidates.map(({ name }) => name)).size !== candidates.length) throw new Error("Missing or duplicate packed release candidates.");
  for (const entry of candidates) {
    if (!validateReleaseVersion(entry.version, channel, line) || byName.get(entry.name)?.manifest.version !== entry.version) {
      throw new Error(`Invalid packed release candidate ${entry.name}@${entry.version}.`);
    }
  }
  for (const { manifest } of packages) {
    if (manifest.version === "0.0.0" || (!line && !validateReleaseVersion(manifest.version, channel))) {
      throw new Error(`Unsupported packed dependency ${manifest.name}@${manifest.version}. Prepare the reviewed version plan first.`);
    }
  }
  return { channel, packages };
}
