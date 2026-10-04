import { randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { VooyaUserError } from "./errors.js";

const sleepCell = new Int32Array(new SharedArrayBuffer(4));
const ownerPattern = /^([1-9]\d*)-[0-9a-f-]{36}\.owner$/;

/** A local-filesystem, same-host lock. Publish only initialized, nonempty
 * directories. Never recursively remove the shared pathname: another process
 * may already have installed its own directory there. PID reuse deliberately
 * fails closed; age alone is not evidence that a build has stopped. */
export function acquireBuildLock(
  workspaceRoot: string,
  { timeoutMs = 30_000, retryMs = 50 }: { timeoutMs?: number; retryMs?: number } = {},
): () => void {
  mkdirSync(workspaceRoot, { recursive: true });
  const lockPath = resolve(workspaceRoot, ".build.lock");
  const owner = `${process.pid}-${randomUUID()}.owner`;
  const candidate = `${lockPath}.candidate-${owner}`;
  mkdirSync(candidate);
  try {
    writeFileSync(resolve(candidate, owner), "", { flag: "wx" });
    const deadline = performance.now() + timeoutMs;
    while (true) {
      try {
        renameSync(candidate, lockPath);
        let released = false;
        return () => {
          if (released) return;
          released = true;
          removeOwner(lockPath, owner);
        };
      } catch (cause) {
        // Windows can report EPERM/EACCES for an existing destination directory.
        // A concurrently removed destination is retried on the next iteration.
        if (!["EEXIST", "ENOTEMPTY", "EPERM", "EACCES", "EISDIR", "ENOTDIR"].includes(errorCode(cause))) throw cause;
        recoverDeadOwner(lockPath);
        if (performance.now() >= deadline) {
          throw new VooyaUserError(`Timed out waiting for the Vooya build workspace at ${workspaceRoot}. Another build may still be running.`, { kind: "workspace-lock", cause });
        }
        Atomics.wait(sleepCell, 0, 0, retryMs);
      }
    }
  } finally {
    // A successfully renamed candidate no longer exists. Only our private
    // directory is cleaned here, including an initialization/write failure.
    removeOwner(candidate, owner);
  }
}

function recoverDeadOwner(lockPath: string): void {
  let stat;
  try { stat = lstatSync(lockPath); } catch (cause) {
    if (errorCode(cause) === "ENOENT") return;
    throw cause;
  }
  if (stat.isFile()) {
    // Migration from the original PR's PID file. unlink cannot delete a newly
    // installed directory, even if another reaper replaced the stale file.
    let pid;
    try { pid = Number(readFileSync(lockPath, "utf8").trim()); } catch (cause) {
      if (["ENOENT", "EISDIR", "EACCES", "EPERM"].includes(errorCode(cause))) return;
      throw cause;
    }
    if (Number.isSafeInteger(pid) && pid > 0 && isDead(pid)) {
      try { unlinkSync(lockPath); } catch (cause) {
        if (!["ENOENT", "EISDIR", "EPERM", "EACCES"].includes(errorCode(cause))) throw cause;
      }
    }
    return;
  }
  if (!stat.isDirectory()) return;
  let owners;
  try { owners = readdirSync(lockPath); } catch (cause) {
    if (errorCode(cause) === "ENOENT") return;
    throw cause;
  }
  for (const owner of owners) {
    const match = ownerPattern.exec(owner);
    if (match && isDead(Number(match[1]))) removeOwner(lockPath, owner);
  }
  removeEmptyDirectory(lockPath);
}

function isDead(pid: number): boolean {
  try { process.kill(pid, 0); return false; } catch (cause) {
    // EPERM and unknown failures are not proof of death.
    return errorCode(cause) === "ESRCH";
  }
}

function removeOwner(directory: string, owner: string): void {
  try { unlinkSync(resolve(directory, owner)); } catch (cause) {
    if (!["ENOENT", "ENOTDIR"].includes(errorCode(cause))) throw cause;
  }
  removeEmptyDirectory(directory);
}

function removeEmptyDirectory(directory: string): void {
  try { rmdirSync(directory); } catch (cause) {
    if (!["ENOENT", "ENOTEMPTY", "EEXIST", "ENOTDIR"].includes(errorCode(cause))) throw cause;
  }
}

function errorCode(cause: unknown): string {
  return (cause as NodeJS.ErrnoException)?.code ?? "";
}
