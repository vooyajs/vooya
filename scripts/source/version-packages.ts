import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readReleaseModel } from "./release-model.js";

const root = fileURLToPath(new URL("../..", import.meta.url));
const before = readReleaseModel(root).packages.map(({ manifest }) => ({ name: manifest.name, version: manifest.version }));
const result = spawnSync(process.execPath, [fileURLToPath(import.meta.resolve("@changesets/cli/bin.js")), "version"], { cwd: root, stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);
const packages = readReleaseModel(root).packages.filter(({ manifest }) => before.find((entry) => entry.name === manifest.name)?.version !== manifest.version).map(({ manifest }) => ({ name: manifest.name, version: manifest.version }));
if (packages.length) writeFileSync(resolve(root, ".changeset/release.json"), `${JSON.stringify({ packages }, null, 2)}\n`);
