import { spawn, spawnSync } from "node:child_process";

// Vite+ launches the Vite CLI as a child. Keep the fixture's whole process tree
// together so stopping vp does not leave a server holding its output pipes open.
export function startDevServer(command, args, options) {
  return spawn(command, args, { ...options, detached: process.platform !== "win32" });
}

export async function stopDevServer(server) {
  if (!server?.pid) return;
  const closed = new Promise((done) => server.once("close", done));
  const stop = (signal) => {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      try { process.kill(-server.pid, signal); }
      catch (error) { if (error.code !== "ESRCH") throw error; }
    }
  };
  stop("SIGTERM");
  await Promise.race([closed, new Promise((done) => setTimeout(done, 2000))]);
  stop("SIGKILL");
}
