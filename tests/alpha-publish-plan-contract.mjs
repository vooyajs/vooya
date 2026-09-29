import assert from "node:assert/strict";
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
