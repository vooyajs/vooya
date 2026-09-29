import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Version = { core: bigint[]; prerelease: string[] };
type Release = { version: string; text: string; body: string };
const options = new Map<string, string>();
for (let index = 2; index < process.argv.length; index += 2) {
  const option = process.argv[index];
  const value = process.argv[index + 1];
  if (!["--root", "--base"].includes(option) || !value || value.startsWith("--") || options.has(option)) {
    throw new Error("Usage: verify-changelogs [--root <directory>] [--base <git revision>]");
  }
  options.set(option, value);
}
const root = resolve(options.get("--root") ?? fileURLToPath(new URL("../..", import.meta.url)));
const base = options.has("--base") ? git(["rev-parse", "--verify", "--end-of-options", `${options.get("--base")}^{commit}`]).trim() : undefined;
const prefix = base ? git(["rev-parse", "--show-prefix"]).trim() : "";
let checked = 0;
for (const directory of readdirSync(resolve(root, "packages"), { withFileTypes: true })) {
  if (!directory.isDirectory()) continue;
  const manifestPath = `packages/${directory.name}/package.json`;
  if (!existsSync(resolve(root, manifestPath))) continue;
  const manifest = JSON.parse(readFileSync(resolve(root, manifestPath), "utf8"));
  if (manifest.private === true) continue;
  if (typeof manifest.name !== "string" || !manifest.name) throw new Error(`${manifestPath} needs a package name.`);
  parseVersion(manifest.version);
  const changelogPath = `packages/${directory.name}/CHANGELOG.md`;
  if (!existsSync(resolve(root, changelogPath))) throw new Error(`${manifest.name} is missing CHANGELOG.md.`);
  const releases = readReleases(readFileSync(resolve(root, changelogPath), "utf8"), changelogPath);
  const current = releases.find((release) => release.version === manifest.version);
  if (!current) throw new Error(`${manifest.name} changelog is missing the exact current version ${manifest.version}.`);
  if (releases[0] !== current) throw new Error(`${manifest.name} current version ${manifest.version} must be the first release in its changelog.`);
  if (!hasContent(current.body)) throw new Error(`${manifest.name}@${manifest.version} changelog release must contain a real summary, not headings, comments, or placeholders.`);
  if (base) {
    const oldManifestText = readBase(manifestPath);
    if (oldManifestText !== undefined) {
      const oldManifest = JSON.parse(oldManifestText);
      if (oldManifest.private !== true) {
        const comparison = compareVersions(parseVersion(manifest.version), parseVersion(oldManifest.version));
        if (comparison < 0 || (manifest.version !== oldManifest.version && comparison === 0)) {
          throw new Error(`${manifest.name} version must increase from ${oldManifest.version}; found ${manifest.version}.`);
        }
        const oldChangelog = readBase(changelogPath);
        if (oldChangelog === undefined) throw new Error(`${manifest.name} has no changelog at base ${base}; establish its history explicitly before a release.`);
        const oldReleases = readReleases(oldChangelog, `${base}:${changelogPath}`);
        for (const historical of oldReleases) {
          const retained = releases.find((release) => release.version === historical.version);
          if (!retained || retained.text !== historical.text) {
            throw new Error(`${manifest.name} rewrites or removes historical changelog release ${historical.version}.`);
          }
        }
        const oldVersions = new Set(oldReleases.map((release) => release.version));
        const invented = releases.filter((release) => !oldVersions.has(release.version) && release.version !== manifest.version);
        if (invented.length) throw new Error(`${manifest.name} adds unrecorded historical releases: ${invented.map((release) => release.version).join(", ")}.`);
        const retainedOrder = releases.filter((release) => oldVersions.has(release.version)).map((release) => release.version);
        if (retainedOrder.join("\n") !== oldReleases.map((release) => release.version).join("\n")) {
          throw new Error(`${manifest.name} reorders historical changelog releases.`);
        }
      }
    }
  }
  checked++;
}
if (checked === 0) throw new Error("No public packages found under packages/*.");
console.log(`Verified current changelog entries for ${checked} independently versioned public packages${base ? ` and preserved history against ${base}` : ""}.`);

function git(args: string[]) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`git ${args[0]} failed: ${result.stderr.trim()}`);
  return result.stdout;
}

function readBase(path: string): string | undefined {
  const object = `${base}:${prefix}${path}`;
  const exists = spawnSync("git", ["cat-file", "-e", object], { cwd: root, encoding: "utf8" });
  if (exists.error) throw exists.error;
  if (exists.status !== 0) return undefined;
  return git(["show", object]);
}

function readReleases(source: string, path: string): Release[] {
  const normalized = source.replace(/\r\n/g, "\n");
  const headings = [...normalized.matchAll(/^##[ \t]+(.+?)\s*$/gm)];
  const releases: Release[] = [];
  for (let index = 0; index < headings.length; index++) {
    const heading = headings[index];
    const match = /^(?:v)?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)(?:[ \t]+-[ \t]+\d{4}-\d{2}-\d{2})?$/.exec(heading[1]);
    if (!match) continue;
    parseVersion(match[1]);
    if (releases.some((release) => release.version === match[1])) throw new Error(`${path} duplicates release ${match[1]}.`);
    const end = headings[index + 1]?.index ?? normalized.length;
    releases.push({
      version: match[1],
      text: normalized.slice(heading.index, end).trimEnd(),
      body: normalized.slice(heading.index + heading[0].length, end),
    });
  }
  return releases;
}

function hasContent(body: string) {
  return body.replace(/<!--[\s\S]*?-->/g, "").split("\n").some((line) => {
    if (/^\s*#/.test(line)) return false;
    const content = line.replace(/^\s*(?:[-*+]\s*|\d+\.\s*)?/, "").replace(/[*_`]/g, "").trim();
    return /[\p{L}\p{N}]/u.test(content) && !/^(?:todo|tbd|n\/?a|none|no changes|placeholder)[.!:]?$/i.test(content);
  });
}

function parseVersion(value: unknown): Version {
  if (typeof value !== "string") throw new Error(`Invalid SemVer ${String(value)}.`);
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(value);
  if (!match) throw new Error(`Invalid SemVer ${value}.`);
  const prerelease = match[4]?.split(".") ?? [];
  if (prerelease.some((part) => /^0\d+$/.test(part))) throw new Error(`Invalid numeric prerelease identifier in ${value}.`);
  return { core: match.slice(1, 4).map((part) => BigInt(part)), prerelease };
}

function compareVersions(left: Version, right: Version): number {
  for (let index = 0; index < 3; index++) {
    if (left.core[index] !== right.core[index]) return left.core[index] > right.core[index] ? 1 : -1;
  }
  if (!left.prerelease.length || !right.prerelease.length) return Number(!left.prerelease.length) - Number(!right.prerelease.length);
  for (let index = 0; index < Math.max(left.prerelease.length, right.prerelease.length); index++) {
    const a = left.prerelease[index];
    const b = right.prerelease[index];
    if (a === b) continue;
    if (a === undefined || b === undefined) return a === undefined ? -1 : 1;
    const aNumeric = /^\d+$/.test(a);
    const bNumeric = /^\d+$/.test(b);
    if (aNumeric && bNumeric) return BigInt(a) > BigInt(b) ? 1 : -1;
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
    return a > b ? 1 : -1;
  }
  return 0;
}
