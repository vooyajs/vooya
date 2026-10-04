import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { downloadVerified } from "../lib/index.js";
import { acquireInstallLock } from "../lib/lock.js";
import { platformManifest } from "../lib/manifest.js";

const temporary = () => mkdtempSync(join(tmpdir(), "vooya-preset-test-"));
test("verifies streamed downloads before publishing and removes failed partials", async () => {
  const root = temporary();
  const server = createServer((_req, res) => res.end("pinned tool"));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/tool`;
  const destination = join(root, "tool");
  try {
    await assert.rejects(downloadVerified({ url, sha256: "0".repeat(64) }, destination), /SHA-256 mismatch/);
    assert.deepEqual(readdirSync(root), []);
    await downloadVerified({ url, sha256: createHash("sha256").update("pinned tool").digest("hex") }, destination);
    assert.equal(readFileSync(destination, "utf8"), "pinned tool");
    assert.deepEqual(readdirSync(root), ["tool"]);
  } finally { server.close(); rmSync(root, { recursive: true, force: true }); }
});
test("parallel preparations wait for the active cache owner", async () => {
  const root = temporary();
  const path = join(root, "install.lock");
  try {
    const release = await acquireInstallLock(path);
    let acquired = false;
    const second = acquireInstallLock(path).then(release => { acquired = true; return release; });
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(acquired, false);
    release();
    (await second)();
    assert.deepEqual(readdirSync(root), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test("recovers lock left by a terminated installer", async () => {
  const root = temporary();
  const path = join(root, "install.lock");
  const child = spawn(process.execPath, ["--input-type=module", "-e", `import { acquireInstallLock } from ${JSON.stringify(new URL("../lib/lock.js", import.meta.url).href)}; await acquireInstallLock(${JSON.stringify(path)}); process.stdout.write('ready'); setInterval(() => {}, 1000);`], { stdio: ["ignore", "pipe", "inherit"] });
  try {
    await new Promise((resolve, reject) => { child.stdout.once("data", resolve); child.once("error", reject); });
    child.kill("SIGKILL");
    await new Promise(resolve => child.once("exit", resolve));
    (await acquireInstallLock(path, 3000))();
    assert.deepEqual(readdirSync(root), []);
  } finally { child.kill(); rmSync(root, { recursive: true, force: true }); }
});
test("tool versions, platform selection and bootstrap integrity are pinned", () => {
  for (const [platform, arch] of [["darwin", "arm64"], ["darwin", "x64"], ["linux", "x64"], ["linux", "arm64"], ["win32", "x64"]]) {
    const manifest = platformManifest(platform, arch);
    assert.match(manifest.rustup.url, /archive\/1\.28\.2\//);
    assert.match(manifest.bindgen.url, /\/0\.2\.115\//);
    assert.match(manifest.rustup.sha256, /^[a-f0-9]{64}$/);
    assert.match(manifest.bindgen.sha256, /^[a-f0-9]{64}$/);
  }
  assert.throws(() => platformManifest("win32", "arm64"), /does not support/);
});

test("interrupted downloads are discarded and can be retried", async () => {
  const root = temporary();
  let interrupt = true;
  const server = createServer((_req, res) => {
    if (interrupt) {
      res.writeHead(200, { "content-length": "1000" });
      res.write("partial");
      setTimeout(() => res.destroy(), 10);
    } else res.end("complete");
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/tool`;
  const asset = { url, sha256: createHash("sha256").update("complete").digest("hex") };
  try {
    await assert.rejects(downloadVerified(asset, join(root, "tool")));
    assert.deepEqual(readdirSync(root), []);
    interrupt = false;
    await downloadVerified(asset, join(root, "tool"));
    assert.equal(readFileSync(join(root, "tool"), "utf8"), "complete");
  } finally { server.close(); rmSync(root, { recursive: true, force: true }); }
});
