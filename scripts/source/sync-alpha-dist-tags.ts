import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readReleaseModel } from "./release-model.js";

const args = process.argv.slice(2);
const flags = new Set<string>();
const values = new Map<string, string>();
for (let i = 0; i < args.length; i++) {
  if (["--root", "--capture-latest", "--latest-before"].includes(args[i])) {
    if (!args[i + 1] || args[i + 1].startsWith("--") || values.has(args[i])) throw new Error(`Missing or duplicate value for ${args[i]}.`);
    values.set(args[i], args[++i]);
  } else if (["--dry-run", "--check", "--check-published"].includes(args[i]) && !flags.has(args[i])) flags.add(args[i]);
  else throw new Error(`Unknown or duplicate option ${args[i]}.`);
}
if (flags.size + Number(values.has("--capture-latest")) > 1) throw new Error("Choose only one release verification mode.");
if (values.has("--latest-before") && !flags.has("--check")) throw new Error("--latest-before requires --check.");
const root = values.has("--root") ? resolve(values.get("--root")) : fileURLToPath(new URL("../..", import.meta.url));
const { packages, byName } = readReleaseModel(root);
for (const { manifest } of packages) {
  if (!/-alpha\.\d+$/.test(manifest.version)) throw new Error(`Refusing to tag non-alpha version ${manifest.name}@${manifest.version} as alpha.`);
}
if (flags.has("--dry-run")) {
  for (const { manifest } of packages) console.log(`Would verify ${manifest.name}@${manifest.version}, then set alpha -> ${manifest.version}`);
} else {
  // Read every package before mutating any tag. Preflight permits new packages;
  // exact post-publish verification never treats an absent version as success.
  const metadata = new Map<string, any>();
  for (const { manifest } of packages) metadata.set(manifest.name, await readMetadata(manifest.name));
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
    writeFileSync(resolve(values.get("--capture-latest")), `${JSON.stringify({ latest }, null, 2)}\n`, { flag: "wx" });
    console.log("Captured npm latest tags before publication.");
  } else if (flags.has("--check-published")) {
    for (const { manifest } of packages) {
      const published = metadata.get(manifest.name);
      const tag = published?.["dist-tags"]?.alpha;
      if (published && (!/-alpha\.\d+$/.test(String(tag)) || !published.versions?.[tag])) throw new Error(`Invalid published alpha tag for ${manifest.name}.`);
    }
    console.log("Preflight checked existing alpha metadata; this does not verify a new publication.");
  } else {
    for (const { manifest } of packages) {
      const published = metadata.get(manifest.name);
      const exact = published?.versions?.[manifest.version];
      if (!exact || exact.name !== manifest.name || exact.version !== manifest.version) throw new Error(`npm registry is missing exact ${manifest.name}@${manifest.version}.`);
      for (const field of ["dependencies", "optionalDependencies"]) {
        const names = new Set([...Object.keys(manifest[field] ?? {}), ...Object.keys(exact[field] ?? {})]);
        for (const name of names) {
          if (byName.has(name) && exact[field]?.[name] !== manifest[field]?.[name]) throw new Error(`Published ${manifest.name} has incorrect ${field}.${name}.`);
        }
      }
      if (flags.has("--check") && published["dist-tags"]?.alpha !== manifest.version) throw new Error(`npm alpha dist-tag for ${manifest.name} must be ${manifest.version}, found ${published["dist-tags"]?.alpha}.`);
    }
    if (values.has("--latest-before")) {
      const before = JSON.parse(readFileSync(resolve(values.get("--latest-before")), "utf8"));
      for (const { manifest } of packages) {
        if (!Object.hasOwn(before.latest ?? {}, manifest.name)) throw new Error(`Latest snapshot is missing ${manifest.name}.`);
        if (before.latest[manifest.name] !== (metadata.get(manifest.name)?.["dist-tags"]?.latest ?? null)) throw new Error(`npm latest changed during alpha publication for ${manifest.name}. Restore the recorded tag before completing the release.`);
      }
    }
    if (!flags.has("--check")) {
      for (const { manifest } of packages) {
        const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["dist-tag", "add", `${manifest.name}@${manifest.version}`, "alpha"], { cwd: root, stdio: "inherit" });
        if (result.error) throw result.error;
        if (result.status !== 0) throw new Error(`npm dist-tag add failed for ${manifest.name}; retry after fixing the cause.`);
      }
    }
    console.log(flags.has("--check") ? "Verified exact published versions, internal dependencies, and alpha tags." : "Synchronized alpha tags; run --check for final verification.");
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
