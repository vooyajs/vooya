import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

const moduleUrl = new URL("../dist/build-lock.js", import.meta.url).href;
const workerSource = String.raw`
  import fs from "node:fs";
  import { syncBuiltinESMExports } from "node:module";
  import { resolve } from "node:path";
  const [moduleUrl, root, mode] = process.argv.slice(1);
  const cell = new Int32Array(new SharedArrayBuffer(4));
  const sleep = (ms) => Atomics.wait(cell, 0, 0, ms);
  function waitFile(path) {
    const deadline = Date.now() + 10_000;
    while (!fs.existsSync(path)) {
      if (Date.now() > deadline) throw new Error("worker barrier timed out: " + path);
      sleep(5);
    }
  }
  // Freeze one old reaper immediately before its actual unlink syscall. The
  // other child can replace the stale lock first, making the ABA race certain.
  if (mode === "delayed-reaper") {
    const unlink = fs.unlinkSync;
    let delayed = false;
    fs.unlinkSync = function(path) {
      if (!delayed && resolve(String(path), "..") === resolve(root, ".build.lock") && String(path).endsWith(".owner")) {
        delayed = true;
        process.send({ kind: "reaper-paused" });
        waitFile(resolve(root, "resume-reaper"));
      }
      return unlink(path);
    };
    syncBuiltinESMExports();
  }
  if (mode === "delayed-release") {
    const rmdir = fs.rmdirSync;
    let delayed = false;
    fs.rmdirSync = function(path) {
      if (!delayed && String(path) === resolve(root, ".build.lock")) {
        delayed = true;
        process.send({ kind: "release-paused" });
        waitFile(resolve(root, "resume-release"));
      }
      return rmdir(path);
    };
    syncBuiltinESMExports();
  }
  const { acquireBuildLock } = await import(moduleUrl);
  process.send({ kind: "ready" });
  if (mode === "contend") waitFile(resolve(root, "start"));
  try {
    const release = acquireBuildLock(root, { timeoutMs: mode === "timeout" ? 180 : 8000, retryMs: 5 });
    process.send({ kind: "acquired", owners: fs.readdirSync(resolve(root, ".build.lock")) });
    if (mode === "hold") waitFile(resolve(root, "release-holder"));
    if (mode === "contend" || mode === "delayed-reaper") {
      const marker = resolve(root, "critical-section");
      const fd = fs.openSync(marker, "wx");
      sleep(35);
      fs.closeSync(fd);
      fs.unlinkSync(marker);
    }
    release();
    release(); // idempotence must not remove a subsequent owner's directory.
    process.send({ kind: "released" });
  } catch (error) {
    process.send({ kind: "error", name: error.name, errorKind: error.kind, message: error.message });
    process.exitCode = 1;
  }
  process.disconnect();
`;

function fixture(t) {
  const root = mkdtempSync(resolve(tmpdir(), "vooya-build-lock-"));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 4, retryDelay: 25 }));
  return root;
}

function worker(t, root, mode) {
  const child = spawn(process.execPath, ["--input-type=module", "--eval", workerSource, moduleUrl, root, mode], {
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  const messages = [];
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("message", (message) => messages.push(message));
  const exit = new Promise((resolveExit) => child.on("exit", (code, signal) => resolveExit({ code, signal })));
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); await exit; });
  return {
    child, messages, exit,
    async message(kind) {
      const deadline = Date.now() + 12_000;
      while (!messages.some((message) => message.kind === kind)) {
        assert.equal(child.exitCode, null, `child exited before ${kind}: ${JSON.stringify(messages)} ${stderr}`);
        assert.ok(Date.now() < deadline, `waiting for ${kind}: ${JSON.stringify(messages)} ${stderr}`);
        await new Promise((r) => setTimeout(r, 5));
      }
      return messages.find((message) => message.kind === kind);
    },
    async success() { assert.deepEqual(await exit, { code: 0, signal: null }, `${JSON.stringify(messages)} ${stderr}`); },
  };
}

async function deadPid(t, root) {
  const child = worker(t, root, "once");
  await child.success();
  return child.child.pid;
}

function staleDirectory(root, pid) {
  const lock = resolve(root, ".build.lock");
  mkdirSync(lock);
  const owner = `${pid}-${randomUUID()}.owner`;
  writeFileSync(resolve(lock, owner), "");
  return owner;
}

test("real processes serialize simultaneous stale-lock recovery", { timeout: 20_000 }, async (t) => {
  const root = fixture(t);
  staleDirectory(root, await deadPid(t, root));
  const children = Array.from({ length: 8 }, () => worker(t, root, "contend"));
  await Promise.all(children.map((child) => child.message("ready")));
  writeFileSync(resolve(root, "start"), "");
  await Promise.all(children.map((child) => child.success()));
  for (const child of children) assert.equal(child.messages.filter((m) => m.kind === "acquired").length, 1);
  assert.equal(existsSync(resolve(root, ".build.lock")), false);
});

test("a delayed stale reaper cannot unlink or remove a new owner's lock", { timeout: 20_000 }, async (t) => {
  const root = fixture(t);
  staleDirectory(root, await deadPid(t, root));
  const reaper = worker(t, root, "delayed-reaper");
  await reaper.message("reaper-paused");
  const holder = worker(t, root, "hold");
  const acquired = await holder.message("acquired");
  writeFileSync(resolve(root, "resume-reaper"), "");
  await new Promise((r) => setTimeout(r, 100));
  assert.deepEqual(readdirSync(resolve(root, ".build.lock")), acquired.owners);
  assert.equal(reaper.messages.some((m) => m.kind === "acquired"), false);
  writeFileSync(resolve(root, "release-holder"), "");
  await Promise.all([holder.success(), reaper.success()]);
});

test("a delayed old release cannot remove a new owner's directory", { timeout: 20_000 }, async (t) => {
  const root = fixture(t);
  const old = worker(t, root, "delayed-release");
  await old.message("release-paused");
  const holder = worker(t, root, "hold");
  const acquired = await holder.message("acquired");
  writeFileSync(resolve(root, "resume-release"), "");
  await old.success();
  assert.deepEqual(readdirSync(resolve(root, ".build.lock")), acquired.owners);
  writeFileSync(resolve(root, "release-holder"), "");
  await holder.success();
});

test("a killed lock holder is recovered by another real process", { timeout: 20_000 }, async (t) => {
  const root = fixture(t);
  const holder = worker(t, root, "hold");
  await holder.message("acquired");
  holder.child.kill("SIGKILL");
  await holder.exit;
  assert.equal(existsSync(resolve(root, ".build.lock")), true);
  await worker(t, root, "once").success();
  assert.equal(existsSync(resolve(root, ".build.lock")), false);
});

test("a live holder times out a competitor without changing ownership", { timeout: 20_000 }, async (t) => {
  const root = fixture(t);
  const holder = worker(t, root, "hold");
  const acquired = await holder.message("acquired");
  const competitor = worker(t, root, "timeout");
  const error = await competitor.message("error");
  assert.equal(error.errorKind, "workspace-lock");
  assert.match(error.message, /Timed out/);
  assert.deepEqual(readdirSync(resolve(root, ".build.lock")), acquired.owners);
  writeFileSync(resolve(root, "release-holder"), "");
  await holder.success();
});

test("an uninitialized private candidate does not occupy the lock; empty canonical recovers", async (t) => {
  const root = fixture(t);
  mkdirSync(resolve(root, ".build.lock.candidate-uninitialized"));
  mkdirSync(resolve(root, ".build.lock"));
  await worker(t, root, "once").success();
  assert.equal(existsSync(resolve(root, ".build.lock")), false);
  assert.equal(existsSync(resolve(root, ".build.lock.candidate-uninitialized")), true);
});

test("legacy dead PID files recover but live PID files remain locked", async (t) => {
  const root = fixture(t);
  writeFileSync(resolve(root, ".build.lock"), `${await deadPid(t, root)}\n`);
  await worker(t, root, "once").success();
  writeFileSync(resolve(root, ".build.lock"), `${process.pid}\n`);
  const competitor = worker(t, root, "timeout");
  assert.equal((await competitor.message("error")).errorKind, "workspace-lock");
  assert.equal(existsSync(resolve(root, ".build.lock")), true);
});
