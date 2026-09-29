import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readReleaseModel } from "./release-model.js";

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--root" || !args[1])) throw new Error("Usage: verify-package-versions [--root path]");
const root = args.length ? resolve(args[1]) : fileURLToPath(new URL("../..", import.meta.url));
const { packages, byName } = readReleaseModel(root);
const lockfile = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));
for (const { path, manifest } of packages) {
  const locked = lockfile.packages?.[path];
  if (!locked || locked.name !== manifest.name || locked.version !== manifest.version) {
    throw new Error(`package-lock.json workspace entry ${path} must match ${manifest.name}@${manifest.version}.`);
  }
  for (const field of ["dependencies", "optionalDependencies"]) {
    const names = new Set([...Object.keys(manifest[field] ?? {}), ...Object.keys(locked[field] ?? {})]);
    for (const name of names) {
      if (!byName.has(name)) continue;
      if (locked[field]?.[name] !== manifest[field]?.[name]) throw new Error(`package-lock.json workspace entry ${path} must keep internal dependency ${name}@${manifest[field]?.[name]}.`);
    }
  }
}
console.log(`Verified ${packages.length} independent package versions, dependency graph, and lockfile.`);
