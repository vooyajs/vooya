import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readReleaseLine, readReleaseChannel, validateReleaseVersion } from "./release-channel.js";

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--root" || !args[1])) throw new Error("Usage: create-github-releases [--root path]");
const root = args.length ? resolve(args[1]) : fileURLToPath(new URL("../..", import.meta.url));
const channel = readReleaseChannel(root);
const line = readReleaseLine(root);
if (line && !((line.branch === "main" && line.channel === "alpha" && line.baseVersion === "0.2.0") || (line.branch === "release/0.1" && line.channel === "beta" && line.baseVersion === "0.1.0"))) throw new Error("Publication is restricted to main/0.2 alpha and release/0.1 beta.");
const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const readJson = (path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const receipt = readJson(`.vooya-tools/release/${sha}/receipt.json`);
if (receipt.commit !== sha) throw new Error("Release receipt does not match git HEAD.");
if (receipt.channel !== channel) throw new Error("Release receipt channel does not match the configured publication channel.");
const candidate = readJson(".changeset/release.json");
if (line) {
  if (JSON.stringify(receipt.line) !== JSON.stringify(line) || JSON.stringify(receipt.candidates) !== JSON.stringify(candidate.packages)) throw new Error("Release receipt does not match the reviewed line and candidates.");
  if (execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim()) throw new Error("GitHub release creation requires a clean reviewed checkout.");
}
if (!Array.isArray(candidate.packages) || !candidate.packages.length || !Array.isArray(receipt.packages)) throw new Error("Release candidate and receipt require packages arrays.");
const repository = process.env.GH_REPO;
if (!repository || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error("GH_REPO must be a GitHub owner/repository.");
const api = new URL(process.env.VOOYA_GITHUB_API_URL ?? "https://api.github.com/");
if (api.username || api.password || api.search || api.hash || api.pathname !== "/" ||
  !(api.origin === "https://api.github.com" || (["127.0.0.1", "localhost", "[::1]"].includes(api.hostname) && ["http:", "https:"].includes(api.protocol)))) {
  throw new Error("VOOYA_GITHUB_API_URL must be api.github.com or a loopback test server.");
}
const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
if (api.hostname === "api.github.com" && !token) throw new Error("GH_TOKEN or GITHUB_TOKEN is required.");

const names = new Set<string>();
// Validate all local evidence before making any GitHub writes.
const releases = candidate.packages.map(({ name, version }) => {
  if (typeof name !== "string" || !/^@vooya\/[a-z0-9-]+$/.test(name) || names.has(name) ||
    !validateReleaseVersion(version, channel, line)) throw new Error(`Invalid or duplicate ${channel} release candidate.`);
  names.add(name);
  const matches = receipt.packages.filter((entry) => entry.name === name);
  if (matches.length !== 1 || matches[0].version !== version) throw new Error(`Receipt is missing exact candidate ${name}@${version}.`);
  const directory = `packages/${name.slice("@vooya/".length)}`;
  const manifest = readJson(`${directory}/package.json`);
  if (manifest.name !== name || manifest.version !== version || manifest.private) throw new Error(`Candidate ${name}@${version} does not match its public manifest.`);
  const source = readFileSync(resolve(root, directory, "CHANGELOG.md"), "utf8").replace(/\r\n/g, "\n");
  const headings = [...source.matchAll(/^##[ \t]+([^\n]+)\n/gm)];
  const sections = headings.flatMap((heading, index) => {
    const title = heading[1].trim();
    if (title !== version && title !== `v${version}`) return [];
    return [source.slice(heading.index + heading[0].length, headings[index + 1]?.index ?? source.length).trim()];
  });
  if (sections.length !== 1 || !sections[0]) throw new Error(`Missing exact changelog section for ${name}@${version}.`);
  return { tag: `${name}@${version}`, body: sections[0] };
});

async function request(path: string, method = "GET", body?: unknown) {
  const response = await fetch(new URL(`repos/${repository}/${path}`, api), {
    method,
    headers: { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
    redirect: "error",
  });
  if (method === "GET" && response.status === 404) return undefined;
  if (!response.ok) throw new Error(`GitHub ${method} ${path} failed with HTTP ${response.status}.`);
  return response.json() as Promise<any>;
}

async function checkTag(tag: string) {
  const ref = await request(`git/ref/tags/${encodeURIComponent(tag)}`);
  if (!ref) return false;
  let object = ref.object;
  const seen = new Set<string>();
  while (object?.type === "tag") {
    if (seen.has(object.sha) || seen.size >= 8) throw new Error(`Invalid annotated tag chain for ${tag}.`);
    seen.add(object.sha);
    const annotation = await request(`git/tags/${encodeURIComponent(object.sha)}`);
    object = annotation?.object;
  }
  if (object?.type !== "commit" || object.sha !== sha) throw new Error(`Git tag ${tag} conflicts with release HEAD ${sha}.`);
  return true;
}

for (const { tag, body } of releases) {
  const existing = await request(`releases/tags/${encodeURIComponent(tag)}`);
  const hasTag = await checkTag(tag);
  if (existing) {
    if (existing.tag_name !== tag || !hasTag) throw new Error(`Existing GitHub release ${tag} does not have the verified commit tag.`);
    console.log(`Preserved existing GitHub release ${tag}.`);
    continue;
  }
  if (!hasTag) {
    await request("git/refs", "POST", { ref: `refs/tags/${tag}`, sha });
    if (!await checkTag(tag)) throw new Error(`Created git tag ${tag} is not visible; retry without changing versions.`);
  }
  await request("releases", "POST", { name: tag, tag_name: tag, target_commitish: sha, body, prerelease: true, make_latest: "false" });
  console.log(`Created GitHub prerelease ${tag}.`);
}
