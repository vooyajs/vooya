import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const dryRun = process.argv.includes("--dry-run");
const check = process.argv.includes("--check");
const checkPublished = process.argv.includes("--check-published");
if ([dryRun, check, checkPublished].filter(Boolean).length > 1) {
  throw new Error("Use only one of --dry-run, --check, or --check-published.");
}
const directories = ["compiler", "core", "build-core", "vite", "vue", "react", "solid", "svelte", "rspack", "webpack"];
const packages = directories.map((directory) =>
  JSON.parse(readFileSync(resolve(root, `packages/${directory}/package.json`), "utf8")),
);
for (const package_ of packages) {
  if (!/-alpha\.\d+$/.test(package_.version)) {
    throw new Error(
      `Refusing to tag non-alpha version ${package_.name}@${package_.version} as alpha.`,
    );
  }

  const specifier = `${package_.name}@${package_.version}`;
  if (dryRun) {
    console.log(`Would set ${package_.name} alpha -> ${package_.version}`);
    continue;
  }
  if (check || checkPublished) {
    const tags = await readDistTags(package_.name);
    if (!tags) {
      if (checkPublished) {
        console.log(`Verified ${package_.name} has no published alpha yet; the next release may create it.`);
        continue;
      }
      throw new Error(`npm registry has no metadata for ${package_.name}.`);
    }
    if (check && tags.alpha !== package_.version) {
      throw new Error(
        `npm alpha dist-tag for ${package_.name} must be ${package_.version}, found ${String(tags.alpha)}.`,
      );
    }
    if (checkPublished && !/-alpha\.\d+$/.test(String(tags.alpha))) {
      throw new Error(`npm alpha dist-tag for ${package_.name} must be an alpha prerelease, found ${String(tags.alpha)}.`);
    }
    console.log(
      check ? `Verified ${package_.name} alpha -> ${package_.version}` : `Verified published ${package_.name} alpha -> ${tags.alpha}`,
    );
    continue;
  }

  const result = spawnSync("npm", ["dist-tag", "add", specifier, "alpha"], {
    cwd: root,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`npm dist-tag add ${specifier} alpha failed.`);
  }
}

if (!dryRun && !check && !checkPublished) console.log("Synchronized alpha dist-tags for all @vooya packages.");

async function readDistTags(name: string): Promise<Record<string, string> | undefined> {
  const registry = process.env.NPM_CONFIG_REGISTRY ?? process.env.npm_config_registry ?? "https://registry.npmjs.org/";
  const url = new URL(encodeURIComponent(name), registry.endsWith("/") ? registry : `${registry}/`);
  // npm/CDN metadata can lag immediately after a publish or dist-tag write.
  // A unique query and no-cache headers prevent one runner-local response from
  // poisoning every retry in the release workflow.
  url.searchParams.set("vooya_check", `${Date.now()}-${Math.random()}`);
  const response = await fetch(url, {
    headers: {
      accept: "application/vnd.npm.install-v1+json",
      "cache-control": "no-cache, no-store",
      pragma: "no-cache",
    },
  });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`npm registry request for ${name} failed with HTTP ${response.status}.`);
  const metadata = await response.json() as { "dist-tags"?: Record<string, string> };
  return metadata["dist-tags"] ?? {};
}
