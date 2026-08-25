import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptRoot = fileURLToPath(new URL("../..", import.meta.url));
const rootOption = process.argv.indexOf("--root");
const root = rootOption === -1 ? scriptRoot : resolve(process.argv[rootOption + 1] ?? "");
const packages = ["vooya-compiler", "vooya-core", "vooya-build-core", "vooya-vite", "vooya-vue", "vooya-react", "vooya-solid", "vooya-svelte", "vooya-rspack", "vooya-webpack"];
const changesDirectory = resolve(root, ".changes");
const changesets = readdirSync(changesDirectory)
  .filter((entry) => entry.endsWith(".md"))
  .sort();

for (const changeset of changesets) {
  const source = readFileSync(resolve(changesDirectory, changeset), "utf8");
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) throw new Error(`${changeset} must start with Semifold front matter.`);
  const entries = [...match[1].matchAll(/^([a-z0-9-]+):\s*["'](major|minor|patch):[a-z]+["']\s*$/gm)];
  const requested = new Map(entries.map(([, name, bump]) => [name, bump]));
  if (requested.size !== packages.length || packages.some((name) => !requested.has(name))) {
    throw new Error(`${changeset} must name every fixed Vooya package: ${packages.join(", ")}.`);
  }
  if (new Set(requested.values()).size !== 1) {
    throw new Error(`${changeset} must use one bump level for the fixed Vooya release group.`);
  }
}

console.log(`Verified ${changesets.length} Semifold changeset(s) against Vooya's fixed release group.`);
