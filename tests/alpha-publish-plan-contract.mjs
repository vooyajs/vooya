import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { readReleaseChannel } from "../scripts/generated/release-channel.js";
import { alphaPublishPlan } from "../scripts/generated/alpha-publish-plan.js";
const candidates = [
  { name: "@vooya/core", version: "0.1.0-alpha.13" },
  { name: "@vooya/vite", version: "0.1.0-alpha.14" },
];
const entry = (candidate, tag = "latest") => ({ kind: "publish", ...candidate, access: "public", tag });
const plan = { version: 1, plan: candidates.map((candidate) => [entry(candidate)]) };
const result = alphaPublishPlan(plan, candidates);
assert.deepEqual(result.plan.flat().map((release) => release.tag), ["alpha", "alpha"]);
assert.equal(plan.plan[0][0].tag, "latest", "upstream plan must not be mutated");
assert.deepEqual(result.plan.map((group) => group.map((release) => release.name)), [["@vooya/core"], ["@vooya/vite"]], "dependency ordering is preserved");
assert.deepEqual(alphaPublishPlan({ version: 1, plan: [] }, candidates).plan, [], "all-published retry is valid");
assert.equal(alphaPublishPlan({ version: 1, plan: [[entry(candidates[1])]] }, candidates).plan.length, 1, "partial-publish retry retains remaining candidates");
for (const invalid of [
  { version: 2, plan: [] },
  { version: 1, plan: [entry(candidates[0])] },
  { version: 1, plan: [[entry({ name: "@vooya/unreviewed", version: "0.1.0-alpha.1" })]] },
  { version: 1, plan: [[entry({ ...candidates[0], version: "0.1.0" })]] },
  { version: 1, plan: [[entry(candidates[0]), entry(candidates[0])]] },
  { version: 1, plan: [[{ ...entry(candidates[0]), kind: "tag-only" }]] },
]) assert.throws(() => alphaPublishPlan(invalid, candidates));
console.log("Alpha publish-plan contract checks passed.");

const betaCandidates = candidates.map((candidate, index) => ({ ...candidate, version: `0.1.0-beta.${index}` }));
const betaPlan = { version: 1, plan: betaCandidates.map((candidate) => [entry(candidate, "alpha")]) };
assert.deepEqual(alphaPublishPlan(betaPlan, betaCandidates, "beta").plan.flat().map((release) => release.tag), ["beta", "beta"]);
assert.deepEqual(alphaPublishPlan({ version: 1, plan: [] }, betaCandidates, "beta").plan, []);
assert.equal(alphaPublishPlan({ version: 1, plan: [[entry(betaCandidates[1])]] }, betaCandidates, "beta").plan.length, 1);
for (const version of ["0.1.0", "0.1.0-alpha.1", "0.2.0-beta.1", "1.1.0-beta.0", "0.1.0-beta.01", "0.1.0-beta.1+build"]) {
  const invalid = [{ name: "@vooya/core", version }];
  assert.throws(() => alphaPublishPlan({ version: 1, plan: [] }, invalid, "beta"), /Invalid beta/);
}
assert.throws(() => alphaPublishPlan(betaPlan, betaCandidates, "alpha"));
console.log("Beta publish-plan checks passed: exact 0.1.0-beta.N, forced tag, partial retries, cross-channel and stable rejection.");

const fixture = mkdtempSync(resolve(tmpdir(), "vooya-release-channel-"));
try {
  mkdirSync(resolve(fixture, ".changeset"));
  for (const tag of ["alpha", "beta"]) {
    writeFileSync(resolve(fixture, ".changeset/pre.json"), JSON.stringify({ mode: "pre", tag }));
    assert.equal(readReleaseChannel(fixture), tag);
  }
  for (const pre of [{ mode: "exit", tag: "beta" }, { mode: "pre", tag: "latest" }, { mode: "pre", tag: "rc" }]) {
    writeFileSync(resolve(fixture, ".changeset/pre.json"), JSON.stringify(pre));
    assert.throws(() => readReleaseChannel(fixture), /stable publication is not enabled/);
  }
} finally { rmSync(fixture, { recursive: true, force: true }); }


const featureLine = { branch: "main", channel: "alpha", baseVersion: "0.2.0" };
const featureCandidate = [{ name: "@vooya/vite", version: "0.2.0-alpha.0" }];
assert.equal(alphaPublishPlan({ version: 1, plan: [[entry(featureCandidate[0])]] }, featureCandidate, "alpha", featureLine).plan[0][0].tag, "alpha");
assert.throws(() => alphaPublishPlan({ version: 1, plan: [[entry({ name: "@vooya/core", version: "0.1.0-beta.0" })]] }, featureCandidate, "alpha", featureLine), /Unexpected publication/);
assert.throws(() => alphaPublishPlan({ version: 1, plan: [] }, [{ name: "@vooya/vite", version: "0.1.0-alpha.1" }], "alpha", featureLine), /Invalid alpha/);

await import("./publisher-guards-contract.mjs");
