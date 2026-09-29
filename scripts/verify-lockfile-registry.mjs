import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// This guard has no dependencies and runs before npm ci in CI.
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--root" || !args[1])) throw new Error("Usage: verify-lockfile-registry [--root path]");
const root = args.length ? resolve(args[1]) : fileURLToPath(new URL("..", import.meta.url));
const lock = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));
if (!lock.packages || typeof lock.packages !== "object") throw new Error("Lockfile must include packages.");
let count = 0;
for (const [path, entry] of Object.entries(lock.packages)) {
  if (entry.link === true) {
    if (typeof entry.resolved !== "string" || !Object.hasOwn(lock.packages, entry.resolved) || !/^packages\/[^/]+$/.test(entry.resolved)) throw new Error(`Invalid workspace link: ${path}.`);
    continue;
  }
  if (!path.includes("node_modules/")) continue;
  let url;
  try { url = new URL(entry.resolved); } catch { throw new Error(`Missing public npm tarball URL: ${path}.`); }
  if (url.origin !== "https://registry.npmjs.org" || url.username || url.password || url.search || url.hash || !url.pathname.endsWith(".tgz")) throw new Error(`Lockfile dependency ${path} must use an official https://registry.npmjs.org tarball.`);
  if (typeof entry.integrity !== "string" || !/^sha(?:1|256|384|512)-[A-Za-z0-9+/]+=*$/.test(entry.integrity)) throw new Error(`Missing lockfile integrity: ${path}.`);
  count++;
}
console.log(`Verified ${count} dependency tarballs use the public npm registry and integrity checks.`);
