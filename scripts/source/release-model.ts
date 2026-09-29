import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseChangesetFile } from "@changesets/parse";

export function readReleaseModel(root: string) {
  const config = JSON.parse(readFileSync(resolve(root, ".changeset/config.json"), "utf8"));
  if (config.access !== "public" || config.changelog === false || config.fixed?.length || config.linked?.length || config.ignore?.length) {
    throw new Error("Release configuration must generate changelogs and publish packages independently without ignored public packages.");
  }
  const packages = readdirSync(resolve(root, "packages")).sort().flatMap((directory) => {
    const path = `packages/${directory}`;
    if (!existsSync(resolve(root, path, "package.json"))) return [];
    const manifest = JSON.parse(readFileSync(resolve(root, path, "package.json"), "utf8"));
    if (manifest.private) return [];
    if (!/^@vooya\/[a-z0-9-]+$/.test(manifest.name)) throw new Error(`Unexpected release package ${manifest.name}.`);
    return [{ directory, path, id: manifest.name as string, manifest }];
  });
  if (!packages.length) throw new Error("No public release packages found.");
  const byName = new Map(packages.map((entry) => [entry.manifest.name, entry]));
  for (const entry of packages) {
    const version = entry.manifest.version;
    const semver = typeof version === "string" && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(version);
    if (!semver || semver[4]?.split(".").some((part) => /^0\d+$/.test(part))) throw new Error(`Invalid version for ${entry.id}.`);
    for (const field of ["dependencies", "optionalDependencies"]) {
      for (const [name, range] of Object.entries(entry.manifest[field] ?? {})) {
        const dependency = byName.get(name);
        if (dependency && range !== dependency.manifest.version) throw new Error(`${entry.manifest.name} must depend on exact ${name}@${dependency.manifest.version}, found ${range}.`);
      }
    }
  }
  return { packages, byName, byId: byName };
}

// Only unconsumed entries participate in the next alpha release. Changesets v3
// keeps consumed prerelease summaries in pre/ for the eventual stable changelog.
export function readChangesets(root: string, model = readReleaseModel(root)) {
  return readdirSync(resolve(root, ".changeset")).filter((name) => name.endsWith(".md") && name !== "README.md").sort().map((name) => {
    const source = readFileSync(resolve(root, ".changeset", name), "utf8");
    const parsed = parseChangesetFile(source);
    const packages = new Map<string, string>();
    for (const release of parsed.releases) {
      if (!model.byName.has(release.name)) throw new Error(`${name} names unknown Vooya package ${release.name}.`);
      if (!["major", "minor", "patch"].includes(release.type)) throw new Error(`${name} must request a patch, minor, or major release.`);
      packages.set(release.name, release.type);
    }
    if (!packages.size) throw new Error(`${name} must name at least one Vooya package.`);
    const summary = parsed.summary.replace(/<!--[\s\S]*?-->/g, "").split("\n").some((line) => {
      if (/^\s*#/.test(line)) return false;
      const content = line.replace(/^\s*(?:[-*+]\s*|\d+\.\s*)?/, "").replace(/[*_`]/g, "").trim();
      return /[\p{L}\p{N}]/u.test(content) && !/^(?:todo|tbd|n\/?a|none|no changes|placeholder)[.!:]?$/i.test(content);
    });
    if (!summary) throw new Error(`${name} must describe the user-visible change in its body.`);
    return { name, packages, source };
  });
}
