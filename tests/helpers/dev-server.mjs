// @ts-check
import { spawn, spawnSync } from "node:child_process";

// Vite+ launches the Vite CLI as a child. Keep the fixture's whole process tree
// together so stopping vp does not leave a server holding its output pipes open.
/** @param {string} command
 * @param {string[]} args
 * @param {import("node:child_process").SpawnOptions} options */
export function startDevServer(command, args, options) {
  return spawn(command, args, { ...options, detached: process.platform !== "win32" });
}

/** @param {import("node:child_process").ChildProcess | undefined} server */
export async function stopDevServer(server) {
  if (!server?.pid) return;
  const pid = server.pid;
  const closed = new Promise((done) => server.once("close", done));
  /** @param {NodeJS.Signals} signal */
  const stop = (signal) => {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      try { process.kill(-pid, signal); }
      catch (error) { if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error; }
    }
  };
  stop("SIGTERM");
  await Promise.race([closed, new Promise((done) => setTimeout(done, 2000))]);
  stop("SIGKILL");
}
