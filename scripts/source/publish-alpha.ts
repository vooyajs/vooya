// One explicit publishing entry point, shared by local maintainers and CI.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { alphaPublishPlan, type ReleaseCandidate } from "./alpha-publish-plan.js";
import { readReleaseLine, readReleaseChannel, validateReleaseVersion } from "./release-channel.js";
import { readChangesets, readReleaseModel } from "./release-model.js";

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--channel" || !["alpha", "beta"].includes(args[1]))) throw new Error("Usage: publish-alpha [--channel alpha|beta]; the full release gate always runs.");
const root = fileURLToPath(new URL("../..", import.meta.url));
const channel = readReleaseChannel(root);
const line = readReleaseLine(root);
if (line && !((line.branch === "main" && line.channel === "alpha" && line.baseVersion === "0.2.0") || (line.branch === "release/0.1" && line.channel === "beta" && line.baseVersion === "0.1.0"))) throw new Error("Publication is restricted to main/0.2 alpha and release/0.1 beta.");
if (!line) throw new Error("Publication requires an explicit reviewed release line configuration.");
if (args.length && args[1] !== channel) throw new Error(`Requested ${args[1]} publication but Changesets is configured for ${channel}.`);
const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const sha = git("rev-parse", "HEAD");
const candidates: ReleaseCandidate[] = JSON.parse(readFileSync(resolve(root, ".changeset/release.json"), "utf8")).packages;
const { packages: modelPackages, byName } = readReleaseModel(root);
if (!Array.isArray(candidates) || !candidates.length || new Set(candidates.map((entry) => entry.name)).size !== candidates.length) throw new Error("Missing or duplicate release candidates.");
for (const entry of candidates) {
  if (!validateReleaseVersion(entry.version, channel, line) || byName.get(entry.name)?.manifest.version !== entry.version) throw new Error(`Invalid ${channel} candidate ${entry.name}@${entry.version}.`);
}
const changedVersions = modelPackages.filter(({ path, manifest }) => {
  const previous = spawnSync("git", ["show", `HEAD^:${path}/package.json`], { cwd: root, encoding: "utf8" });
  return previous.status !== 0 || JSON.parse(previous.stdout).version !== manifest.version;
}).map(({ manifest }) => manifest.name).sort();
if (JSON.stringify(changedVersions) !== JSON.stringify(candidates.map((entry) => entry.name).sort())) throw new Error("Publish the release commit itself; candidates must exactly match its version changes.");
function assertReady() {
  if (process.env.GITHUB_ACTIONS === "true") {
    if (process.env.GITHUB_EVENT_NAME !== "workflow_dispatch" || process.env.GITHUB_REF !== `refs/heads/${line.branch}` || process.env.GITHUB_SHA !== sha || process.env.VOOYA_RELEASE_SHA !== sha) throw new Error("Publication requires an explicit workflow dispatch for this release line and exact HEAD.");
  } else if (git("branch", "--show-current") !== line.branch) throw new Error(`Publish ${channel} from the reviewed ${line.branch} checkout.`);
  if (git("status", "--porcelain")) throw new Error("Commit the release plan before publishing; the checkout must be clean.");
  if (git("rev-parse", "HEAD") !== sha) throw new Error("HEAD changed during release validation.");
  if (readChangesets(root).length) throw new Error("Pending changesets remain. Run version:packages and review/commit its output first.");
}
function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed; fix the cause and retry the release.`);
}
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const node = (script: string, ...args: string[]) => run(process.execPath, [resolve(root, "scripts/generated", `${script}.js`), ...args]);
assertReady();
run(npm, ["run", "verify:release"]);
run(npm, ["run", "build:packages"]);
assertReady();
const output = resolve(root, ".vooya-tools/release", sha);
mkdirSync(output, { recursive: true });
const latestBefore = resolve(output, "latest-before.json");
// Keep the original baseline when retrying a partial publication at this SHA.
try { readFileSync(latestBefore); } catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  node("sync-alpha-dist-tags", "--capture-latest", latestBefore);
}
node("sync-alpha-dist-tags", "--check-baseline", "--latest-before", latestBefore);
const cli = fileURLToPath(import.meta.resolve("@changesets/cli/bin.js"));
const planPath = resolve(output, "publish-plan.json");
run(process.execPath, [cli, "publish-plan", "--output", planPath]);
const plan = alphaPublishPlan(JSON.parse(readFileSync(planPath, "utf8")), candidates, channel, line);
writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
const packed = resolve(output, "packed");
run(process.execPath, [cli, "pack", "--from-publish-plan", planPath, "--out-dir", packed]);
assertReady();
run(process.execPath, [cli, "publish", "--from-pack-dir", packed, "--no-git-tag"]);
let lastError: unknown;
for (const delay of [0, 5, 10, 20, 40, 80]) {
  if (delay) await new Promise((done) => setTimeout(done, delay * 1000));
  try {
    node("sync-alpha-dist-tags", "--sync", "--latest-before", latestBefore);
    node("sync-alpha-dist-tags", "--check", "--latest-before", latestBefore);
    lastError = undefined;
    break;
  } catch (error) { lastError = error; }
}
if (lastError) throw lastError;
run(process.execPath, [resolve(root, "tests/registry-consumer.mjs"), "--tag", channel, "--expected-root", root]);
const { packages } = readReleaseModel(root);
const receipt = { commit: sha, verifiedAt: new Date().toISOString(), channel, line, candidates, packages: packages.map(({ manifest }) => ({ name: manifest.name, version: manifest.version })) };
writeFileSync(resolve(output, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
const notes = packages.filter(({ manifest }) => candidates.some((entry) => entry.name === manifest.name)).map(({ path, manifest }) => {
  const source = readFileSync(resolve(root, path, "CHANGELOG.md"), "utf8");
  const section = source.split(/^## /m).slice(1).find((section) => section.split("\n", 1)[0].trim() === manifest.version || section.split("\n", 1)[0].trim() === `v${manifest.version}`);
  return `## ${manifest.name}@${manifest.version}\n\n${section?.slice(section.indexOf("\n") + 1).trim() ?? ""}`;
});
writeFileSync(resolve(output, "release-notes.md"), `# ${channel} release verification\n\nCommit: ${sha}\n\nThis records only published candidates; the receipt also contains verified unchanged dependencies.\n\n${notes.join("\n\n")}\n`);
console.log(`Release verified. Receipt and per-package notes: ${output}`);
