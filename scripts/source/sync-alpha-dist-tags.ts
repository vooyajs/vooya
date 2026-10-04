import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readReleaseModel } from "./release-model.js";
import { readReleaseLine, readReleaseChannel, validateReleaseVersion } from "./release-channel.js";

const args = process.argv.slice(2);
const flags = new Set<string>();
const values = new Map<string, string>();
for (let i = 0; i < args.length; i++) {
  if (["--root", "--capture-latest", "--latest-before"].includes(args[i])) {
    if (!args[i + 1] || args[i + 1].startsWith("--") || values.has(args[i])) throw new Error(`Missing or duplicate value for ${args[i]}.`);
    values.set(args[i], args[++i]);
  } else if (["--sync", "--dry-run", "--check", "--check-published", "--check-baseline"].includes(args[i]) && !flags.has(args[i])) flags.add(args[i]);
  else throw new Error(`Unknown or duplicate option ${args[i]}.`);
}
if (flags.size + Number(values.has("--capture-latest")) > 1) throw new Error("Choose only one release verification mode.");
if (values.has("--latest-before") && !flags.has("--check") && !flags.has("--check-baseline") && !flags.has("--sync")) throw new Error("--latest-before requires --check, --sync or --check-baseline.");
const root = values.has("--root") ? resolve(values.get("--root")) : fileURLToPath(new URL("../..", import.meta.url));
if (flags.has("--check-baseline") && !values.has("--latest-before")) throw new Error("--check-baseline requires --latest-before.");
const channel = readReleaseChannel(root);
const line = readReleaseLine(root);
if (line && !((line.branch === "main" && line.channel === "alpha" && line.baseVersion === "0.2.0") || (line.branch === "release/0.1" && line.channel === "beta" && line.baseVersion === "0.1.0"))) throw new Error("Publication is restricted to main/0.2 alpha and release/0.1 beta.");
const { packages, byName } = readReleaseModel(root);
const reviewed = JSON.parse(readFileSync(resolve(root, ".changeset/release.json"), "utf8")).packages;
if (!Array.isArray(reviewed) || !reviewed.length || new Set(reviewed.map((entry: any) => entry.name)).size !== reviewed.length) throw new Error("Missing or duplicate release candidates.");
const candidates = line ? packages.filter(({ manifest }) => reviewed.some((entry: any) => entry.name === manifest.name)) : packages;
for (const entry of reviewed) if (byName.get(entry.name)?.manifest.version !== entry.version) throw new Error(`Invalid release candidate ${entry.name}@${entry.version}.`);
if (!line && ((!flags.size && !values.has("--capture-latest")) || flags.has("--sync"))) throw new Error("Tag mutation requires an explicit reviewed release line.");
if (line && ((!flags.size && !values.has("--capture-latest")) || flags.has("--sync")) && !values.has("--latest-before")) throw new Error("Tag mutation requires the original protected-tag baseline.");
for (const { manifest } of candidates) {
  if (!flags.has("--check-published") && !validateReleaseVersion(manifest.version, channel, line)) throw new Error(`Refusing to tag version ${manifest.name}@${manifest.version} as ${channel}.`);
}
if (flags.has("--dry-run")) {
  for (const { manifest } of candidates) console.log(`Would verify ${manifest.name}@${manifest.version}, then set ${channel} -> ${manifest.version}`);
} else {
  // Read every package before mutating any tag. Preflight permits new packages;
  // exact post-publish verification never treats an absent version as success.
  const metadata = new Map<string, any>();
  for (const { manifest } of packages) metadata.set(manifest.name, await readMetadata(manifest.name));
  if (line && !flags.has("--check-published")) {
    for (const { manifest } of candidates) {
      const current = metadata.get(manifest.name)?.["dist-tags"]?.[channel];
      if (current !== undefined) {
        const parts = (version: string) => {
          const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-(alpha|beta)\.(0|[1-9]\d*)$/.exec(version);
          if (!match || match[4] !== channel) throw new Error(`Invalid existing ${channel} tag for ${manifest.name}.`);
          return [match[1], match[2], match[3], match[5]].map(BigInt);
        };
        const active = parts(current), target = parts(manifest.version);
        const different = active.findIndex((part, index) => part !== target[index]);
        if (different >= 0 && active[different] > target[different]) throw new Error(`Refusing to roll back ${manifest.name} ${channel} from ${current} to ${manifest.version}.`);
      }
    }
  }
  if (values.has("--capture-latest")) {
    // A missing baseline after a partial publication cannot be reconstructed:
    // latest may already have moved. Only a wholly unpublished candidate set
    // can establish a fresh baseline, including in a new workflow run.
    const candidates = JSON.parse(readFileSync(resolve(root, ".changeset/release.json"), "utf8")).packages;
    if (!Array.isArray(candidates) || !candidates.length || new Set(candidates.map((entry: any) => entry.name)).size !== candidates.length) throw new Error("Missing or duplicate release candidates for latest capture.");
    for (const entry of candidates) {
      if (byName.get(entry.name)?.manifest.version !== entry.version) throw new Error(`Invalid latest capture candidate ${entry.name}@${entry.version}.`);
      if (metadata.get(entry.name)?.versions?.[entry.version]) throw new Error(`Cannot capture a new latest baseline: ${entry.name}@${entry.version} is already published. Restore the original latest-before.json artifact for this release SHA.`);
    }
    const latest = Object.fromEntries(packages.map(({ manifest }) => [manifest.name, metadata.get(manifest.name)?.["dist-tags"]?.latest ?? null]));
    const protectedTag = channel === "beta" ? "alpha" : "beta";
    const other = Object.fromEntries(packages.map(({ manifest }) => [manifest.name, metadata.get(manifest.name)?.["dist-tags"]?.[protectedTag] ?? null]));
    const unchanged = Object.fromEntries(packages.filter(({ manifest }) => !reviewed.some((entry: any) => entry.name === manifest.name)).map(({ manifest }) => [manifest.name, metadata.get(manifest.name)?.["dist-tags"]?.[channel] ?? null]));
    writeFileSync(resolve(values.get("--capture-latest")), `${JSON.stringify({ channel, latest, [protectedTag]: other, ...(line ? { line, candidates: reviewed, unchanged } : {}) }, null, 2)}\n`, { flag: "wx" });
    console.log("Captured npm latest tags before publication.");
  } else if (flags.has("--check-baseline")) {
    verifyBaseline(metadata);
    console.log("Verified protected tag baseline before publication.");
  } else if (flags.has("--check-published")) {
    for (const { manifest } of packages) {
      const published = metadata.get(manifest.name);
      const tag = published?.["dist-tags"]?.[channel];
      if (tag !== undefined && (!validateReleaseVersion(tag, channel) || !published?.versions?.[tag])) throw new Error(`Invalid published ${channel} tag for ${manifest.name}.`);
    }
    console.log(`Preflight checked existing ${channel} metadata; this does not verify a new publication.`);
  } else {
    for (const { manifest } of packages) {
      const published = metadata.get(manifest.name);
      const exact = published?.versions?.[manifest.version];
      if (!exact || exact.name !== manifest.name || exact.version !== manifest.version) throw new Error(`npm registry is missing exact ${manifest.name}@${manifest.version}.`);
      for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
        const names = new Set([...Object.keys(manifest[field] ?? {}), ...Object.keys(exact[field] ?? {})]);
        for (const name of names) {
          if (byName.has(name) && exact[field]?.[name] !== manifest[field]?.[name]) throw new Error(`Published ${manifest.name} has incorrect ${field}.${name}.`);
        }
      }
      if (flags.has("--check") && candidates.some((entry) => entry.manifest.name === manifest.name) && published["dist-tags"]?.[channel] !== manifest.version) throw new Error(`npm ${channel} dist-tag for ${manifest.name} must be ${manifest.version}, found ${published["dist-tags"]?.[channel]}.`);
    }
    if (values.has("--latest-before")) verifyBaseline(metadata);
    if (!flags.has("--check")) {
      for (const { manifest } of candidates) {
        if (metadata.get(manifest.name)?.["dist-tags"]?.[channel] === manifest.version) continue;
        const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["dist-tag", "add", `${manifest.name}@${manifest.version}`, channel], { cwd: root, stdio: "inherit" });
        if (result.error) throw result.error;
        if (result.status !== 0) throw new Error(`npm dist-tag add failed for ${manifest.name}; retry after fixing the cause.`);
      }
    }
    console.log(flags.has("--check") ? `Verified exact published versions, internal dependencies, and ${channel} tags.` : `Synchronized ${channel} tags; run --check for final verification.`);
  }
}

async function readMetadata(name: string) {
  const registry = process.env.NPM_CONFIG_REGISTRY ?? process.env.npm_config_registry ?? "https://registry.npmjs.org/";
  const url = new URL(encodeURIComponent(name), registry.endsWith("/") ? registry : `${registry}/`);
  url.searchParams.set("vooya_check", `${Date.now()}-${Math.random()}`);
  const response = await fetch(url, {
    signal: AbortSignal.timeout(30_000),
    headers: { accept: "application/vnd.npm.install-v1+json", "cache-control": "no-cache, no-store", pragma: "no-cache" },
  });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`npm registry request for ${name} failed with HTTP ${response.status}.`);
  return response.json();
}

function verifyBaseline(metadata: Map<string, any>) {
  const before = JSON.parse(readFileSync(resolve(values.get("--latest-before")), "utf8"));
  if (before.channel !== channel && !(channel === "alpha" && before.channel === undefined)) throw new Error("Protected tag snapshot channel does not match this release.");
  if (line) {
    if (JSON.stringify(before.line) !== JSON.stringify(line) || JSON.stringify(before.candidates) !== JSON.stringify(reviewed)) throw new Error("Protected tag baseline does not match the release line and candidates.");
    for (const { manifest } of packages.filter(({ manifest }) => !reviewed.some((entry: any) => entry.name === manifest.name))) {
      if (!Object.hasOwn(before.unchanged ?? {}, manifest.name) || before.unchanged[manifest.name] !== (metadata.get(manifest.name)?.["dist-tags"]?.[channel] ?? null)) throw new Error(`Unchanged dependency ${manifest.name} channel tag moved during publication.`);
    }
  }
  for (const tag of channel === "beta" ? ["latest", "alpha"] : ["latest", "beta"]) {
    for (const { manifest } of packages) {
      if (!Object.hasOwn(before[tag] ?? {}, manifest.name)) throw new Error(`Protected ${tag} snapshot is missing ${manifest.name}.`);
      if (before[tag][manifest.name] !== (metadata.get(manifest.name)?.["dist-tags"]?.[tag] ?? null)) throw new Error(`npm ${tag} changed during ${channel} publication for ${manifest.name}. Restore the recorded tag before completing the release.`);
    }
  }
}
