import { validateReleaseVersion, type ReleaseLine, type ReleaseChannel } from "./release-channel.js";
export type ReleaseCandidate = { name: string; version: string };

// The pinned Changesets v3 plan owns ordering and partial-publication handling.
// Override only the channel: its prerelease default can otherwise move latest.
export function alphaPublishPlan(document: any, candidates: ReleaseCandidate[], channel: ReleaseChannel = "alpha", line?: ReleaseLine) {
  if (document?.version !== 1 || !Array.isArray(document.plan) || !document.plan.every(Array.isArray)) throw new Error("Unsupported Changesets publish-plan format.");
  if (!candidates.length || new Set(candidates.map((entry) => entry.name)).size !== candidates.length || candidates.some((entry) => !validateReleaseVersion(entry.version, channel, line))) throw new Error(`Invalid ${channel} release candidates.`);
  const expected = new Map(candidates.map((entry) => [entry.name, entry.version]));
  const seen = new Set<string>();
  for (const entry of document.plan.flat()) {
    if (entry.kind !== "publish" || expected.get(entry.name) !== entry.version || seen.has(entry.name) || !validateReleaseVersion(entry.version, channel, line)) throw new Error(`Unexpected publication outside the reviewed release: ${entry.name}@${entry.version}.`);
    seen.add(entry.name);
  }
  return { ...document, plan: document.plan.map((group: any[]) => group.map((entry) => ({ ...entry, tag: channel }))) };
}
