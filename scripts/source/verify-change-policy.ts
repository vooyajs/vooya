import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { readChangesets, readReleaseModel } from "./release-model.js";

const args = process.argv.slice(2);
const options = new Map<string, string>();
for (let i = 0; i < args.length; i += 2) {
  if (!["--root", "--base"].includes(args[i]) || !args[i + 1] || options.has(args[i])) throw new Error("Usage: verify-change-policy --base ref [--root path]");
  options.set(args[i], args[i + 1]);
}
if (!options.has("--base")) throw new Error("--base is required; use the PR base commit or a release base.");
const root = options.has("--root") ? resolve(options.get("--root")) : fileURLToPath(new URL("../..", import.meta.url));
const git = (...values: string[]) => execFileSync("git", values, { cwd: root, encoding: "utf8" }).trim();
const base = git("merge-base", options.get("--base"), "HEAD");
const changed = git("diff", "--name-only", "--no-renames", base, "--").split("\n").filter(Boolean);
const model = readReleaseModel(root);
const entries = readChangesets(root, model);
const covered = new Set(entries.filter((entry) => changed.includes(`.changeset/${entry.name}`)).flatMap((entry) => [...entry.packages.keys()]));
const required = new Set<string>();
let versionChanges = 0;
function previous(path: string) {
  const result = spawnSync("git", ["show", `${base}:${path}`], { cwd: root, encoding: "utf8" });
  return result.status === 0 ? result.stdout : undefined;
}
function normalizedManifest(manifest: any) {
  const copy = structuredClone(manifest);
  delete copy.version;
  for (const field of ["dependencies", "optionalDependencies"]) {
    for (const name of Object.keys(copy[field] ?? {})) if (model.byName.has(name)) copy[field][name] = "<release-version>";
  }
  return copy;
}
for (const entry of model.packages) {
  const old = previous(`${entry.path}/package.json`);
  if (old && JSON.parse(old).version !== entry.manifest.version) versionChanges++;
  for (const path of changed.filter((path) => path.startsWith(`${entry.path}/`))) {
    const relative = path.slice(entry.path.length + 1);
    if (relative === "CHANGELOG.md" || /(^|\/)(test|tests|__tests__|__snapshots__)\//.test(relative) || /\.(?:test|spec)\.[^.]+$/.test(relative) || /^(?:README|LICENSE|LICENSE-MIT|LICENSE-APACHE)(?:\.[^/]*)?$/.test(relative) || relative.startsWith("docs/")) continue;
    if (relative === "package.json" && old && isDeepStrictEqual(normalizedManifest(JSON.parse(old)), normalizedManifest(entry.manifest))) continue;
    required.add(entry.id);
  }
}
if (changed.some((path) => /^crates\/(?:vooya|vooya-macros)\//.test(path) && !/\/(?:tests|examples)\//.test(path) && !/\.md$/.test(path))) required.add("@vooya/core");
if (versionChanges && required.size) throw new Error("Separate release version changes from published source changes; submit source changes with package-scoped changesets first.");
const missing = [...required].filter((id) => !covered.has(id));
if (missing.length) throw new Error(`Published source changes require new or updated changesets for: ${missing.join(", ")}.`);
const changelog = spawnSync(process.execPath, [fileURLToPath(new URL("./verify-changelogs.js", import.meta.url)), "--root", root, "--base", base], { stdio: "inherit" });
if (changelog.status !== 0) process.exit(changelog.status ?? 1);
console.log(`Verified release policy against ${base}: ${required.size} directly changed package(s), ${versionChanges} version update(s).`);
