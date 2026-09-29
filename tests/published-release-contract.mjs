import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  await succeeds("capture latest before publishing", ["--capture-latest", snapshot], /Captured npm latest tags/);
  assert.deepEqual(JSON.parse(readFileSync(snapshot, "utf8")), {
    latest: { "@vooya/build-core": "0.0.1", "@vooya/core": "0.0.1", "@vooya/vite": "0.0.1" },
  });
  await succeeds("latest is unchanged", ["--check", "--latest-before", snapshot]);
  metadata.get("@vooya/core")["dist-tags"].latest = "0.1.0-alpha.11";
  await fails("alpha publication changed latest", ["--check", "--latest-before", snapshot], /latest changed during alpha publication for @vooya\/core/);

  resetRegistry();
  await fails("unknown flags fail closed", ["--check", "--not-a-mode"], /Unknown or duplicate option --not-a-mode/);
  assert.equal(requests.length, 0, "Invalid options must fail before querying npm.");
  console.log("Published release contract passed: independent versions, exact dependencies, alpha tags, missing versions, 404 preflight, latest snapshots, and CLI guards.");
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
  assert(args.some((argument) => ["--check", "--check-published", "--capture-latest", "--dry-run"].includes(argument)), "Every invocation must select a non-mutating mode.");
  const env = { ...process.env, NPM_CONFIG_REGISTRY: `http://127.0.0.1:${server.address().port}/` };
  // Even a regression into the default mutation path cannot launch a real npm.
  for (const name of Object.keys(env)) if (name.toLowerCase() === "path") delete env[name];
  env.PATH = "";
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
