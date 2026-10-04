import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const fixture = mkdtempSync(resolve(tmpdir(), "vooya-github-release-"));
const packages = [{ name: "@vooya/core", version: "0.1.0-alpha.12" }, { name: "@vooya/vite", version: "0.1.0-alpha.13" }];
const tags = packages.map(({ name, version }) => `${name}@${version}`);
let channel = "alpha";
let sha;
let state;
const server = createServer(async (request, response) => {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  const body = raw ? JSON.parse(raw) : undefined;
  const path = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname).replace(/^\/repos\/test\/vooya\//, "");
  state.requests.push({ method: request.method, path, body });
  const send = (status, value) => { response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(value)); };
  if (request.method === "GET") {
    const value = path.startsWith("releases/tags/") ? state.releases.get(path.slice(14))
      : path.startsWith("git/ref/tags/") ? state.refs.get(path.slice(13))
      : path.startsWith("git/tags/") ? state.annotations.get(path.slice(9)) : undefined;
    return send(value ? 200 : 404, value ?? { message: "Not Found" });
  }
  if (request.method === "POST" && path === "git/refs") {
    const tag = body.ref.slice("refs/tags/".length);
    if (state.refs.has(tag)) return send(422, { message: "Already exists" });
    const value = { object: { type: "commit", sha: body.sha } };
    state.refs.set(tag, value);
    return send(201, value);
  }
  if (request.method === "POST" && path === "releases") {
    if (state.failRelease === body.tag_name) { state.failRelease = undefined; return send(503, { message: "Retry" }); }
    if (state.releases.has(body.tag_name)) return send(422, { message: "Already exists" });
    state.releases.set(body.tag_name, body);
    return send(201, body);
  }
  return send(405, { message: "Forbidden fixture operation" });
});

try {
  for (const { name, version } of packages) {
    const directory = `packages/${name.slice(7)}`;
    write(`${directory}/package.json`, JSON.stringify({ name, version }));
    write(`${directory}/CHANGELOG.md`, `# Changelog\n\n## ${name.endsWith("core") ? "v" : ""}${version}\n\n### Fixes\n\n- Exact notes for ${name}.\n\n## 0.1.0-alpha.1\n\n- Historical notes stay out.\n`);
  }
  write(".changeset/pre.json", JSON.stringify({ mode: "pre", tag: "alpha" }));
  write(".changeset/release.json", JSON.stringify({ packages }));
  for (const args of [["init", "--quiet"], ["add", "."], ["-c", "user.name=Vooya test", "-c", "user.email=tests@vooya.dev", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "release fixture"]]) {
    const result = spawnSync("git", args, { cwd: fixture, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  }
  sha = spawnSync("git", ["rev-parse", "HEAD"], { cwd: fixture, encoding: "utf8" }).stdout.trim();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  reset();
  await succeeds("creates missing tags and releases");
  assert.equal(state.releases.size, 2);
  for (const [tag, release] of state.releases) {
    assert.equal(release.tag_name, tag);
    assert.equal(release.target_commitish, sha);
    assert.equal(release.prerelease, true);
    assert.equal(release.make_latest, "false");
    assert.match(release.body, /Exact notes/);
    assert.doesNotMatch(release.body, /Historical notes|alpha\.1/);
    assert.equal(state.refs.get(tag).object.sha, sha);
  }
  state.requests = [];
  state.releases.get(tags[0]).body = "Maintainer-edited notes";
  await succeeds("existing releases are preserved");
  assert.equal(state.releases.get(tags[0]).body, "Maintainer-edited notes");
  assert(state.requests.every(({ method }) => method === "GET"));

  reset();
  state.refs.set(tags[0], { object: { type: "tag", sha: "annotation" } });
  state.annotations.set("annotation", { object: { type: "commit", sha } });
  await succeeds("annotated tags are peeled to the verified commit");
  assert(state.requests.some(({ path }) => path === "git/tags/annotation"));

  reset();
  state.refs.set(tags[0], { object: { type: "commit", sha: "0".repeat(40) } });
  await fails("conflicting tag", /conflicts with release HEAD/);
  assert(state.requests.every(({ method }) => method === "GET"));

  reset();
  state.releases.set(tags[0], { tag_name: tags[0] });
  state.refs.set(tags[0], { object: { type: "tag", sha: "wrong-annotation" } });
  state.annotations.set("wrong-annotation", { object: { type: "commit", sha: "0".repeat(40) } });
  await fails("existing release with a conflicting annotated tag", /conflicts with release HEAD/);

  reset();
  rmSync(resolve(fixture, receiptPath()));
  await fails("missing receipt", /ENOENT/);
  assert.equal(state.requests.length, 0);
  reset();
  write(receiptPath(), JSON.stringify({ commit: "wrong", packages }));
  await fails("receipt for another commit", /does not match git HEAD/);
  assert.equal(state.requests.length, 0);
  reset();
  write(receiptPath(), JSON.stringify({ commit: sha, channel, packages: [packages[0]] }));
  await fails("missing candidate version in receipt", /missing exact candidate/);
  assert.equal(state.requests.length, 0);

  reset();
  state.failRelease = tags[1];
  await fails("partial failure retains completed releases", /HTTP 503/);
  assert.equal(state.releases.size, 1);
  assert.equal(state.refs.size, 2);
  state.requests = [];
  await succeeds("retry fills only the missing release");
  const writes = state.requests.filter(({ method }) => method === "POST");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].body.tag_name, tags[1]);

  reset();
  await fails("repository must be owner/name", /GH_REPO must/, { GH_REPO: "https://github.com/test/vooya" });
  await fails("test override cannot send credentials to arbitrary hosts", /loopback test server/, { VOOYA_GITHUB_API_URL: "https://example.com/" });
  assert.equal(state.requests.length, 0);
  channel = "beta";
  write(".changeset/pre.json", JSON.stringify({ mode: "pre", tag: channel }));
  for (const [index, candidate] of packages.entries()) {
    candidate.version = `0.1.0-beta.${index}`;
    write(`packages/${candidate.name.slice(7)}/package.json`, JSON.stringify(candidate));
    write(`packages/${candidate.name.slice(7)}/CHANGELOG.md`, `# Changelog\n\n## ${candidate.version}\n\n- Exact beta notes for ${candidate.name}.\n`);
    tags[index] = `${candidate.name}@${candidate.version}`;
  }
  write(".changeset/release.json", JSON.stringify({ packages }));
  reset();
  state.failRelease = tags[1];
  await fails("partial beta GitHub release can retry", /HTTP 503/);
  await succeeds("beta retry finishes missing package only");
  for (const release of state.releases.values()) {
    assert.equal(release.prerelease, true);
    assert.equal(release.make_latest, "false");
    assert.match(release.tag_name, /0\.1\.0-beta\./);
  }
  reset();
  write(receiptPath(), JSON.stringify({ commit: sha, channel: "alpha", packages }));
  await fails("receipt from wrong channel cannot create beta releases", /receipt channel/);
  assert.equal(state.requests.length, 0);
  channel = "alpha";
  const line = { baseVersion: "0.2.0", channel, branch: "main" };
  packages[1].version = "0.2.0-alpha.0";
  write(".changeset/pre.json", JSON.stringify({ mode: "pre", tag: channel }));
  write(".changeset/line.json", JSON.stringify(line));
  write(".changeset/release.json", JSON.stringify({ packages: [packages[1]] }));
  write("packages/vite/package.json", JSON.stringify(packages[1]));
  write("packages/vite/CHANGELOG.md", "# Changelog\n\n## 0.2.0-alpha.0\n\n- Feature candidate only.\n");
  write(".gitignore", ".vooya-tools/\n");
  for (const args of [["add", ".changeset", "packages", ".gitignore"], ["-c", "user.name=Vooya test", "-c", "user.email=tests@vooya.dev", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "mixed-line release"]]) {
    const result = spawnSync("git", args, { cwd: fixture, encoding: "utf8" }); assert.equal(result.status, 0, result.stderr);
  }
  sha = spawnSync("git", ["rev-parse", "HEAD"], { cwd: fixture, encoding: "utf8" }).stdout.trim();
  reset();
  write(receiptPath(), JSON.stringify({ commit: sha, channel, line, candidates: [packages[1]], packages }));
  await succeeds("mixed graph only creates the alpha candidate GitHub release");
  assert.deepEqual([...state.releases.keys()], ["@vooya/vite@0.2.0-alpha.0"]);
  state.requests = [];
  await succeeds("mixed graph GitHub release retry is read-only");
  assert(state.requests.every(({ method }) => method === "GET"));
  console.log("GitHub release contract passed: receipt guards, exact notes, missing/existing releases, annotated/conflicting tags, alpha/beta partial retry, channel receipts, and endpoint guards.");
} finally {
  server.closeAllConnections();
  if (server.listening) await new Promise((done) => server.close(done));
  rmSync(fixture, { recursive: true, force: true });
}

function receiptPath() { return `.vooya-tools/release/${sha}/receipt.json`; }
function write(path, text) { const destination = resolve(fixture, path); mkdirSync(resolve(destination, ".."), { recursive: true }); writeFileSync(destination, text); }
function reset() {
  state = { requests: [], refs: new Map(), releases: new Map(), annotations: new Map(), failRelease: undefined };
  write(receiptPath(), JSON.stringify({ commit: sha, channel, packages }));
}
async function run(env = {}) {
  const child = spawn(process.execPath, [resolve(root, "scripts/generated/create-github-releases.js"), "--root", fixture], {
    cwd: fixture,
    env: { ...process.env, GH_TOKEN: "fixture-token", GH_REPO: "test/vooya", VOOYA_GITHUB_API_URL: `http://127.0.0.1:${server.address().port}/`, ...env },
    stdio: ["ignore", "pipe", "pipe"], timeout: 20_000,
  });
  let output = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
  const [code, signal] = await once(child, "close");
  assert.equal(signal, null, output);
  return { code, output };
}
async function succeeds(description) { const result = await run(); assert.equal(result.code, 0, `${description}: ${result.output}`); }
async function fails(description, pattern, env) { const result = await run(env); assert.notEqual(result.code, 0, description); assert.match(result.output, pattern, description); }
