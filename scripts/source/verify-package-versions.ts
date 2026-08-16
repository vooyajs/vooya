import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptRoot = fileURLToPath(new URL("../..", import.meta.url));
const rootOption = process.argv.indexOf("--root");
const root = rootOption === -1 ? scriptRoot : resolve(process.argv[rootOption + 1] ?? "");
const directories = ["compiler", "core", "build-core", "vite-plugin", "vue", "react", "webpack"];
const packageEntries = directories.map((directory) => ({
  directory,
  path: resolve(root, `packages/${directory}/package.json`),
  package: JSON.parse(readFileSync(resolve(root, `packages/${directory}/package.json`), "utf8")),
}));
const packages = packageEntries.map((entry) => entry.package);
const expectedNames = packages.map((package_) => package_.name).sort();
const versions = new Set(packages.map((package_) => package_.version));

if (versions.size !== 1) {
  throw new Error(
    `@vooya packages must use one version, found: ${packages
      .map((package_) => `${package_.name}@${package_.version}`)
      .join(", ")}`,
  );
}

const plugin = packages.find((package_) => package_.name === "@vooya/vite-plugin");
const buildCore = packages.find((package_) => package_.name === "@vooya/build-core");
const webpack = packages.find((package_) => package_.name === "@vooya/webpack");
if (buildCore.dependencies["@vooya/core"] !== buildCore.version || buildCore.dependencies["@vooya/compiler"] !== buildCore.version) {
  throw new Error("@vooya/build-core must depend on exact fixed @vooya/core and @vooya/compiler versions.");
}
if (plugin.dependencies["@vooya/core"] !== plugin.version) {
  throw new Error("@vooya/vite-plugin must depend on the exact fixed @vooya/core version.");
}
if (plugin.dependencies["@vooya/compiler"] !== plugin.version) {
  throw new Error("@vooya/vite-plugin must depend on the exact fixed @vooya/compiler version.");
}
if (plugin.dependencies["@vooya/build-core"] !== plugin.version) {
  throw new Error("@vooya/vite-plugin must depend on the exact fixed @vooya/build-core version.");
}
if (webpack.dependencies["@vooya/build-core"] !== webpack.version || webpack.dependencies["@vooya/compiler"] !== webpack.version) {
  throw new Error("@vooya/webpack must depend on exact fixed @vooya/build-core and @vooya/compiler versions.");
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
    if (range !== package_.version) {
      throw new Error(
        `${package_.name} must depend on the exact fixed ${dependency} version ${package_.version}, found ${range}.`,
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
    throw new Error(`Semifold must configure ${package_.name} as a fixed Vooya release package.`);
  }
}

console.log(`Verified fixed @vooya package release contract at version ${packages[0].version}.`);
