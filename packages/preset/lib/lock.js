import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";

// Publish an initialized nonempty directory. Reapers only unlink the exact
// dead owner's file; they never recursively remove a possibly replaced lock.
export async function acquireInstallLock(path, timeoutMs = 15 * 60_000) {
  const owner = `${process.pid}-${randomUUID()}.owner`;
  const candidate = `${path}.candidate-${owner}`;
  mkdirSync(candidate);
  writeFileSync(join(candidate, owner), "", { flag: "wx" });
  const deadline = Date.now() + timeoutMs;
  try {
    while (true) {
      try {
        renameSync(candidate, path);
        return () => removeOwner(path, owner);
      } catch (error) {
        if (!["EEXIST", "ENOTEMPTY", "EPERM", "EACCES"].includes(error.code)) throw error;
        let owners = [];
        try { owners = readdirSync(path); } catch (cause) { if (cause.code !== "ENOENT") throw cause; }
        for (const name of owners) {
          const pid = /^([1-9]\d*)-[0-9a-f-]+\.owner$/.exec(name)?.[1];
          if (!pid) continue;
          try { process.kill(Number(pid), 0); } catch (cause) {
            if (cause.code === "ESRCH") removeOwner(path, name);
          }
        }
        if (Date.now() >= deadline) throw new Error(`Timed out waiting for managed toolchain installation at ${path}.`);
        await setTimeout(100);
      }
    }
  } finally { removeOwner(candidate, owner); }
}
function removeOwner(path, owner) {
  try { unlinkSync(join(path, owner)); } catch (error) { if (error.code !== "ENOENT") throw error; }
  try { rmdirSync(path); } catch (error) { if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes(error.code)) throw error; }
}
