export type ReleaseCandidate = { name: string; version: string };

// The pinned Changesets v3 plan owns ordering and partial-publication handling.
// Override only the channel: its prerelease default can otherwise move latest.
export function alphaPublishPlan(document: any, candidates: ReleaseCandidate[]) {
  if (document?.version !== 1 || !Array.isArray(document.plan) || !document.plan.every(Array.isArray)) throw new Error("Unsupported Changesets publish-plan format.");
  const expected = new Map(candidates.map((entry) => [entry.name, entry.version]));
  const seen = new Set<string>();
  for (const entry of document.plan.flat()) {
    if (entry.kind !== "publish" || expected.get(entry.name) !== entry.version || seen.has(entry.name) || !/^0\.\d+\.\d+-alpha\.\d+$/.test(entry.version)) throw new Error(`Unexpected publication outside the reviewed release: ${entry.name}@${entry.version}.`);
    seen.add(entry.name);
  }
  return { ...document, plan: document.plan.map((group: any[]) => group.map((entry) => ({ ...entry, tag: "alpha" }))) };
}
