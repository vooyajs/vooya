import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptRoot = fileURLToPath(new URL("../..", import.meta.url));
const rootOption = process.argv.indexOf("--root");
const root = rootOption === -1 ? scriptRoot : resolve(process.argv[rootOption + 1] ?? "");
const directories = ["compiler", "core", "build-core", "vite", "vue", "react", "solid", "svelte", "rspack", "webpack"];
const packageEntries = directories.map((directory) => ({
  directory,
  path: resolve(root, `packages/${directory}/package.json`),
  package: JSON.parse(readFileSync(resolve(root, `packages/${directory}/package.json`), "utf8")),
}));
const packages = packageEntries.map((entry) => entry.package);
const expectedNames = packages.map((package_) => package_.name).sort();
const versionsByName = new Map(packages.map((package_) => [package_.name, package_.version]));

const plugin = packages.find((package_) => package_.name === "@vooya/vite");
const buildCore = packages.find((package_) => package_.name === "@vooya/build-core");
const rspack = packages.find((package_) => package_.name === "@vooya/rspack");
const webpack = packages.find((package_) => package_.name === "@vooya/webpack");
for (const package_ of [buildCore, plugin, rspack, webpack]) {
  for (const [dependency, range] of Object.entries(package_.dependencies ?? {})) {
    const expected = versionsByName.get(dependency);
    if (expected !== undefined && range !== expected) {
      throw new Error(`${package_.name} must depend on exact ${dependency}@${expected}, found ${range}.`);
    }
  }
}

const lockfile = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));
for (const { directory, path, package: package_ } of packageEntries) {
  const lockEntry = lockfile.packages?.[`packages/${directory}`];
  if (!lockEntry) throw new Error(`package-lock.json is missing workspace entry packages/${directory}.`);
  if (lockEntry.name !== package_.name || lockEntry.version !== package_.version) {
    throw new Error(
      `package-lock.json workspace entry packages/${directory} must match ${path}: expected ${package_.name}@${package_.version}, found ${lockEntry.name ?? "unknown"}@${lockEntry.version ?? "unknown"}.`,
    );
  }
  for (const [dependency, range] of Object.entries(package_.dependencies ?? {})) {
    if (!expectedNames.includes(dependency)) continue;
    const expected = versionsByName.get(dependency);
    if (range !== expected) {
      throw new Error(
        `${package_.name} must depend on exact ${dependency}@${expected}, found ${range}.`,
      );
    }
    if (lockEntry.dependencies?.[dependency] !== range) {
      throw new Error(
        `package-lock.json workspace entry packages/${directory} must keep internal dependency ${dependency}@${range}.`,
      );
    }
  }
}

const semifoldConfig = readFileSync(resolve(root, ".changes/config.toml"), "utf8");
for (const package_ of packages) {
  const id = package_.name.replace("@vooya/", "vooya-");
  if (!new RegExp(`\\[packages\\.${id.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\]`).test(semifoldConfig)) {
    throw new Error(`Semifold must configure ${package_.name} as a publishable Vooya package.`);
  }
}

console.log(`Verified independent @vooya package versions and exact internal dependencies.`);
