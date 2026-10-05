import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const fixture = mkdtempSync(resolve(tmpdir(), "vooya-published-release-"));
const manifests = [
  { name: "@vooya/core", version: "0.1.0-alpha.11" },
  { name: "@vooya/build-core", version: "0.1.0-alpha.13", dependencies: { "@vooya/core": "0.1.0-alpha.11" } },
  {
    name: "@vooya/vite", version: "0.1.0-alpha.15",
    dependencies: { "@vooya/build-core": "0.1.0-alpha.13", external: "^2.0.0" },
    optionalDependencies: { "@vooya/core": "0.1.0-alpha.11" },
  },
];
let metadata;
let requests = [];
const server = createServer((request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  const name = decodeURIComponent(url.pathname.slice(1));
  requests.push({ method: request.method, name });
  if (request.method !== "GET") {
    response.writeHead(405).end("Registry mutations are forbidden in this fixture.");
    return;
  }
  const value = metadata.get(name);
  response.writeHead(value ? 200 : 404, { "content-type": "application/json" });
  response.end(JSON.stringify(value ?? { error: "not found" }));
});

try {
  mkdirSync(resolve(fixture, ".changeset"));
  for (const manifest of manifests) {
    const directory = manifest.name.slice("@vooya/".length);
    mkdirSync(resolve(fixture, "packages", directory), { recursive: true });
    writeFileSync(resolve(fixture, "packages", directory, "package.json"), JSON.stringify(manifest));
  }
  writeFileSync(resolve(fixture, ".changeset/config.json"), JSON.stringify({ access: "public", changelog: "@changesets/cli/changelog", fixed: [], linked: [], ignore: [] }));
  writeFileSync(resolve(fixture, ".changeset/release.json"), JSON.stringify({ packages: [manifests[0]] }));
  writeFileSync(resolve(fixture, ".changeset/pre.json"), JSON.stringify({ mode: "pre", tag: "alpha" }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  resetRegistry();
  await succeeds("dry-run", ["--dry-run"], /Would verify @vooya\/vite@0\.1\.0-alpha\.15/);
  assert.equal(requests.length, 0, "Dry-run must not query or mutate npm.");
  await succeeds("independent versions and exact internal dependencies", ["--check"], /Verified exact published versions/);
  assert.deepEqual(requests.map(({ name }) => name).sort(), manifests.map(({ name }) => name).sort());

  resetRegistry();
  metadata.get("@vooya/vite")["dist-tags"].alpha = "0.1.0-alpha.1";
  await fails("wrong alpha target", ["--check"], /alpha dist-tag for @vooya\/vite must be 0\.1\.0-alpha\.15/);
  await succeeds("preflight accepts an older valid alpha", ["--check-published"], /does not verify a new publication/);
  metadata.get("@vooya/vite")["dist-tags"].alpha = "0.1.0";
  await fails("preflight rejects a stable alpha tag", ["--check-published"], /Invalid published alpha tag for @vooya\/vite/);

  resetRegistry();
  const vite = metadata.get("@vooya/vite");
  delete vite.versions["0.1.0-alpha.15"];
  vite["dist-tags"].alpha = "0.1.0-alpha.1";
  await succeeds("preflight before the new version exists", ["--check-published"]);
  await fails("missing exact target version", ["--check"], /missing exact @vooya\/vite@0\.1\.0-alpha\.15/);

  resetRegistry();
  metadata.delete("@vooya/core");
  await succeeds("404 is allowed before a first publication", ["--check-published"]);
  await fails("404 cannot prove a completed publication", ["--check"], /missing exact @vooya\/core@0\.1\.0-alpha\.11/);
  const absentSnapshot = resolve(fixture, "absent-latest.json");
  await succeeds("capture absent latest", ["--capture-latest", absentSnapshot]);
  assert.equal(JSON.parse(readFileSync(absentSnapshot, "utf8")).latest["@vooya/core"], null);

  resetRegistry();
  published("@vooya/build-core").dependencies["@vooya/core"] = "^0.1.0-alpha.11";
  await fails("published internal dependency must stay exact", ["--check"], /incorrect dependencies\.@vooya\/core/);
  resetRegistry();
  delete published("@vooya/vite").dependencies["@vooya/build-core"];
  await fails("published internal dependency must not disappear", ["--check"], /incorrect dependencies\.@vooya\/build-core/);
  resetRegistry();
  published("@vooya/vite").optionalDependencies["@vooya/core"] = "0.1.0-alpha.10";
  await fails("published optional internal dependency must match", ["--check"], /incorrect optionalDependencies\.@vooya\/core/);
  resetRegistry();
  published("@vooya/core").dependencies = { "@vooya/build-core": "0.1.0-alpha.13" };
  await fails("unexpected published internal dependency", ["--check"], /incorrect dependencies\.@vooya\/build-core/);

  resetRegistry();
  const snapshot = resolve(fixture, "latest-before.json");
  await fails("missing baseline after partial publication fails closed", ["--capture-latest", snapshot], /already published.*Restore the original latest-before/);
  delete metadata.get("@vooya/core").versions[manifests[0].version];
  await succeeds("capture before candidates publish despite unchanged published packages", ["--capture-latest", snapshot], /Captured npm latest tags/);
  await fails("an existing baseline cannot be overwritten", ["--capture-latest", snapshot], /EEXIST/);
  resetRegistry();
  assert.deepEqual(JSON.parse(readFileSync(snapshot, "utf8")), {
    channel: "alpha", beta: Object.fromEntries(manifests.map(({ name }) => [name, null])), latest: { "@vooya/build-core": "0.0.1", "@vooya/core": "0.0.1", "@vooya/vite": "0.0.1" },
  });
  await succeeds("latest is unchanged", ["--check", "--latest-before", snapshot]);
  metadata.get("@vooya/core")["dist-tags"].latest = "0.1.0-alpha.11";
  await fails("alpha publication changed latest", ["--check", "--latest-before", snapshot], /latest changed during alpha publication for @vooya\/core/);

  resetRegistry();
  await fails("unknown flags fail closed", ["--check", "--not-a-mode"], /Unknown or duplicate option --not-a-mode/);
  assert.equal(requests.length, 0, "Invalid options must fail before querying npm.");
  // Preparation is read-only: beta may be configured while manifests are
  // still alpha, and npm may not have any beta dist-tags yet.
  writeFileSync(resolve(fixture, ".changeset/pre.json"), JSON.stringify({ mode: "pre", tag: "beta" }));
  resetRegistry();
  await succeeds("first beta preflight accepts alpha-only registry", ["--check-published"]);
  await fails("beta tagging rejects alpha manifests", ["--dry-run"], /Refusing to tag/);
  const betaVersions = new Map(manifests.map((manifest, index) => [manifest.name, `0.1.0-beta.${index}`]));
  for (const manifest of manifests) {
    manifest.version = betaVersions.get(manifest.name);
    for (const field of ["dependencies", "optionalDependencies"]) for (const name of Object.keys(manifest[field] ?? {})) {
      if (betaVersions.has(name)) manifest[field][name] = betaVersions.get(name);
    }
    writeFileSync(resolve(fixture, "packages", manifest.name.slice(7), "package.json"), JSON.stringify(manifest));
  }
  writeFileSync(resolve(fixture, ".changeset/release.json"), JSON.stringify({ packages: manifests.slice(0, 2) }));
  const resetBeta = () => {
    resetRegistry();
    for (const manifest of manifests) Object.assign(metadata.get(manifest.name)["dist-tags"], { beta: manifest.version, alpha: "0.1.0-alpha.1" });
  };
  resetBeta();
  await succeeds("beta exact metadata and tags", ["--check"]);
  await succeeds("beta dry-run targets beta only", ["--dry-run"], /then set beta -> 0\.1\.0-beta/);
  const betaSnapshot = resolve(fixture, "beta-before.json");
  delete metadata.get(manifests[0].name).versions[manifests[0].version];
  await fails("partial beta cannot reconstruct its baseline", ["--capture-latest", betaSnapshot], /already published/);
  delete metadata.get(manifests[1].name).versions[manifests[1].version];
  await succeeds("new beta captures latest and alpha", ["--capture-latest", betaSnapshot]);
  const betaBefore = JSON.parse(readFileSync(betaSnapshot, "utf8"));
  assert.equal(betaBefore.channel, "beta");
  assert.deepEqual(betaBefore.alpha, Object.fromEntries(manifests.map(({ name }) => [name, "0.1.0-alpha.1"])));
  resetBeta();
  await succeeds("retry validates original protected tags before mutation", ["--check-baseline", "--latest-before", betaSnapshot]);
  await succeeds("beta completion preserves both protected tags", ["--check", "--latest-before", betaSnapshot]);
  metadata.get("@vooya/core")["dist-tags"].alpha = "0.1.0-beta.0";
  await fails("beta cannot move alpha", ["--check", "--latest-before", betaSnapshot], /alpha changed during beta/);
  await fails("retry detects changed alpha before publishing", ["--check-baseline", "--latest-before", betaSnapshot], /alpha changed during beta/);
  resetBeta();
  metadata.get("@vooya/core")["dist-tags"].latest = "0.1.0-beta.0";
  await fails("beta cannot move latest", ["--check", "--latest-before", betaSnapshot], /latest changed during beta/);
  resetBeta();
  await fails("alpha-only baseline cannot authorize beta", ["--check-baseline", "--latest-before", snapshot], /snapshot channel/);
  delete betaBefore.alpha["@vooya/core"];
  writeFileSync(betaSnapshot, JSON.stringify(betaBefore));
  await fails("beta baseline must include every alpha tag", ["--check-baseline", "--latest-before", betaSnapshot], /alpha snapshot is missing/);
  metadata.get("@vooya/vite")["dist-tags"].beta = "0.2.0-beta.0";
  await fails("beta preflight rejects another release line", ["--check-published"], /Invalid published beta/);
  // An alpha feature candidate consumes unchanged beta packages. Only the
  // reviewed candidates may receive alpha tags; both other channels are frozen.
  writeFileSync(resolve(fixture, ".changeset/pre.json"), JSON.stringify({ mode: "pre", tag: "alpha" }));
  writeFileSync(resolve(fixture, ".changeset/line.json"), JSON.stringify({ baseVersion: "0.2.0", channel: "alpha", branch: "main" }));
  const versions = ["0.1.0-beta.0", "0.2.0-alpha.0", "0.2.0-alpha.0"];
  for (const [index, manifest] of manifests.entries()) {
    manifest.version = versions[index];
    for (const field of ["dependencies", "optionalDependencies"]) for (const name of Object.keys(manifest[field] ?? {})) {
      const dependency = manifests.findIndex((entry) => entry.name === name);
      if (dependency >= 0) manifest[field][name] = versions[dependency];
    }
    writeFileSync(resolve(fixture, "packages", manifest.name.slice(7), "package.json"), JSON.stringify(manifest));
  }
  writeFileSync(resolve(fixture, ".changeset/release.json"), JSON.stringify({ packages: manifests.slice(1).map(({ name, version }) => ({ name, version })) }));
  resetRegistry();
  for (const manifest of manifests) Object.assign(metadata.get(manifest.name)["dist-tags"], { alpha: "0.1.0-alpha.1", beta: "0.1.0-beta.0" });
  const alphaSnapshot = resolve(fixture, "alpha-two-before.json");
  for (const manifest of manifests.slice(1)) delete metadata.get(manifest.name).versions[manifest.version];
  await succeeds("alpha line captures both channels and candidate identities", ["--capture-latest", alphaSnapshot]);
  const alphaBefore = JSON.parse(readFileSync(alphaSnapshot, "utf8"));
  assert.deepEqual(alphaBefore.unchanged, { "@vooya/core": "0.1.0-alpha.1" });
  assert.equal(alphaBefore.beta["@vooya/vite"], "0.1.0-beta.0");
  await fails("partial alpha cannot tag any candidate before all versions exist", ["--sync", "--latest-before", alphaSnapshot], /missing exact/);
  for (const manifest of manifests.slice(1)) metadata.get(manifest.name).versions[manifest.version] = structuredClone(manifest);
  await fails("mutating tags requires original baseline", ["--sync"], /requires the original/);
  metadata.get("@vooya/core")["dist-tags"].beta = "0.1.0-beta.9";
  await fails("alpha cannot move an unchanged dependency's beta", ["--sync", "--latest-before", alphaSnapshot], /beta changed during alpha/);
  metadata.get("@vooya/core")["dist-tags"].beta = "0.1.0-beta.0";
  if (process.platform !== "win32") {
    // Only npm's mutation boundary is stubbed. The real verifier, HTTP metadata
    // reads, preflight, candidate filtering and retry decisions execute unchanged.
    mkdirSync(resolve(fixture, "bin"));
    const npm = resolve(fixture, "bin/npm");
    writeFileSync(npm, `#!${process.execPath}\nimport('node:fs').then(({appendFileSync}) => appendFileSync(${JSON.stringify(resolve(fixture, "tag-calls.jsonl"))}, JSON.stringify(process.argv.slice(2)) + "\\n"));\n`);
    chmodSync(npm, 0o755);
    await succeeds("only alpha candidates are sent to npm", ["--sync", "--latest-before", alphaSnapshot]);
    const calls = readFileSync(resolve(fixture, "tag-calls.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
    assert.deepEqual(calls, manifests.slice(1).map(({ name, version }) => ["dist-tag", "add", `${name}@${version}`, "alpha"]));
    for (const manifest of manifests.slice(1)) metadata.get(manifest.name)["dist-tags"].alpha = manifest.version;
    await succeeds("retry is idempotent after candidate tags become visible", ["--sync", "--latest-before", alphaSnapshot]);
    assert.equal(readFileSync(resolve(fixture, "tag-calls.jsonl"), "utf8").trim().split("\n").length, 2);
    await succeeds("mixed-line dependency graph verifies without retagging beta core", ["--check", "--latest-before", alphaSnapshot]);
  }
  metadata.get("@vooya/vite")["dist-tags"].alpha = "0.2.0-alpha.1";
  await fails("old release retries cannot roll back a newer alpha", ["--sync", "--latest-before", alphaSnapshot], /Refusing to roll back/);
  metadata.get("@vooya/vite")["dist-tags"].alpha = "0.2.0-alpha.0";
  metadata.get("@vooya/core")["dist-tags"].alpha = "0.2.0-alpha.0";
  await fails("noncandidate alpha tag must also remain unchanged", ["--check-baseline", "--latest-before", alphaSnapshot], /Unchanged dependency/);
  // First-publication latest is a captured exception, never inferred from null.
  resetRegistry();
  metadata.delete("@vooya/build-core");
  const existingWithoutLatest = metadata.get("@vooya/vite");
  delete existingWithoutLatest.versions[manifests[2].version];
  delete existingWithoutLatest["dist-tags"].latest;
  existingWithoutLatest["dist-tags"].alpha = "0.1.0-alpha.1";
  const firstSnapshot = resolve(fixture, "first-publication.json");
  await succeeds("capture distinguishes a missing package from missing latest", ["--capture-latest", firstSnapshot]);
  const firstBefore = JSON.parse(readFileSync(firstSnapshot, "utf8"));
  assert.deepEqual(firstBefore.firstPublicationLatest, { "@vooya/build-core": "0.2.0-alpha.0" });
  assert.equal(firstBefore.latest["@vooya/vite"], null);
  await succeeds("first-publication baseline accepts still-absent package", ["--check-baseline", "--latest-before", firstSnapshot]);
  metadata.set("@vooya/build-core", {
    name: manifests[1].name,
    versions: { [manifests[1].version]: structuredClone(manifests[1]) },
    "dist-tags": { latest: manifests[1].version, alpha: manifests[1].version },
  });
  existingWithoutLatest.versions[manifests[2].version] = structuredClone(manifests[2]);
  existingWithoutLatest["dist-tags"].alpha = manifests[2].version;
  await succeeds("npm automatic latest is allowed for the captured first version", ["--check", "--latest-before", firstSnapshot]);
  existingWithoutLatest["dist-tags"].latest = manifests[2].version;
  await fails("an existing package without latest receives no exception", ["--check", "--latest-before", firstSnapshot], /latest changed during alpha.*vite/);
  delete existingWithoutLatest["dist-tags"].latest;
  const firstTags = metadata.get("@vooya/build-core")["dist-tags"];
  firstTags.beta = manifests[1].version;
  await fails("first publication never exempts the other channel", ["--check", "--latest-before", firstSnapshot], /beta changed during alpha/);
  delete firstTags.beta;
  firstTags.latest = "0.2.0-alpha.1";
  await fails("first latest cannot point to another version", ["--check", "--latest-before", firstSnapshot], /Invalid first-publication latest/);
  delete firstTags.latest;
  await fails("published first package must have its exact latest", ["--check", "--latest-before", firstSnapshot], /Invalid first-publication latest/);
  firstTags.latest = manifests[1].version;
  const legacyFirst = structuredClone(firstBefore);
  delete legacyFirst.firstPublicationLatest;
  writeFileSync(firstSnapshot, JSON.stringify(legacyFirst));
  await fails("old baselines remain strict and are not upgraded implicitly", ["--check", "--latest-before", firstSnapshot], /latest changed during alpha/);
  for (const exceptions of [null, [], "all", { "@vooya/build-core": "0.2.0-alpha.1" }, { "@vooya/core": "0.1.0-beta.0" }, { "@vooya/unknown": "0.2.0-alpha.0" }]) {
    writeFileSync(firstSnapshot, JSON.stringify({ ...firstBefore, firstPublicationLatest: exceptions }));
    await fails("malformed, wrong-version or noncandidate exception fails closed", ["--check", "--latest-before", firstSnapshot], /Invalid firstPublicationLatest snapshot/);
  }
  for (const tag of ["latest", "beta"]) {
    const invalid = structuredClone(firstBefore);
    invalid[tag]["@vooya/build-core"] = "0.1.0-beta.0";
    writeFileSync(firstSnapshot, JSON.stringify(invalid));
    await fails("first-publication exception requires an originally absent protected tag", ["--check", "--latest-before", firstSnapshot], /Invalid firstPublicationLatest snapshot/);
    delete invalid[tag]["@vooya/build-core"];
    writeFileSync(firstSnapshot, JSON.stringify(invalid));
    await fails("first-publication exception requires complete baseline entries", ["--check", "--latest-before", firstSnapshot], /Invalid firstPublicationLatest snapshot/);
  }
  writeFileSync(firstSnapshot, JSON.stringify(firstBefore));
  await succeeds("captured baseline remains valid after rejected alterations", ["--check", "--latest-before", firstSnapshot]);
  console.log("Published release contract passed: independent versions, exact dependencies, alpha tags, missing versions, 404 preflight, latest/alpha protected snapshots, alpha/beta retries, and CLI guards.");
} finally {
  server.closeAllConnections();
  if (server.listening) await new Promise((done) => server.close(done));
  rmSync(fixture, { recursive: true, force: true });
}

function resetRegistry() {
  requests = [];
  metadata = new Map(manifests.map((manifest) => [manifest.name, {
    name: manifest.name,
    "dist-tags": { alpha: manifest.version, latest: "0.0.1" },
    versions: {
      [manifest.version]: structuredClone(manifest),
      "0.1.0-alpha.1": { name: manifest.name, version: "0.1.0-alpha.1" },
    },
  }]));
}

function published(name) {
  return metadata.get(name).versions[manifests.find((manifest) => manifest.name === name).version];
}

async function succeeds(description, args, expected) {
  const result = await run(args);
  assert.equal(result.code, 0, `${description}:\n${result.output}`);
  if (expected) assert.match(result.output, expected, description);
}

async function fails(description, args, expected) {
  const result = await run(args);
  assert.notEqual(result.code, 0, `${description} unexpectedly passed:\n${result.output}`);
  assert.match(result.output, expected, description);
}

async function run(args) {
  assert(args.some((argument) => ["--sync", "--check", "--check-published", "--check-baseline", "--capture-latest", "--dry-run"].includes(argument)), "Every invocation must select a non-mutating mode.");
  const env = { ...process.env, NPM_CONFIG_REGISTRY: `http://127.0.0.1:${server.address().port}/` };
  // Even a regression into the default mutation path cannot launch a real npm.
  for (const name of Object.keys(env)) if (name.toLowerCase() === "path") delete env[name];
  env.PATH = args.includes("--sync") ? resolve(fixture, "bin") : "";
  const child = spawn(process.execPath, [resolve(root, "scripts/generated/sync-alpha-dist-tags.js"), "--root", fixture, ...args], {
    cwd: fixture, env, stdio: ["ignore", "pipe", "pipe"], timeout: 20_000,
  });
  let output = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
  const [code, signal] = await once(child, "close");
  assert.equal(signal, null, `Verifier terminated with ${signal}:\n${output}`);
  assert(requests.every(({ method }) => method === "GET"), "Verifier attempted a registry mutation.");
  return { code, output };
}
