import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const dryRun = process.argv.includes("--dry-run");
const check = process.argv.includes("--check");
const checkPublished = process.argv.includes("--check-published");
const channelArgument = process.argv.find((argument) => argument.startsWith("--channel="));
const channel = channelArgument?.slice("--channel=".length) ?? "alpha";
if (!/^[a-z][a-z0-9-]*$/.test(channel)) throw new Error(`Invalid npm dist-tag channel ${JSON.stringify(channel)}.`);
if ([dryRun, check, checkPublished].filter(Boolean).length > 1) {
  throw new Error("Use only one of --dry-run, --check, or --check-published.");
}
const directories = ["compiler", "core", "build-core", "vite", "vue", "react", "solid", "svelte", "rspack", "webpack"];
const packages = directories.map((directory) =>
  JSON.parse(readFileSync(resolve(root, `packages/${directory}/package.json`), "utf8")),
);
for (const package_ of packages) {
  if (!new RegExp(`-${channel}\\.\\d+$`).test(package_.version)) {
    throw new Error(
      `Refusing to tag non-${channel} version ${package_.name}@${package_.version} as ${channel}.`,
    );
  }

  const specifier = `${package_.name}@${package_.version}`;
  if (dryRun) {
    console.log(`Would set ${package_.name} ${channel} -> ${package_.version}`);
    continue;
  }
  if (check || checkPublished) {
    const tags = await readDistTags(package_.name);
    if (!tags) {
      if (checkPublished) {
        console.log(`Verified ${package_.name} has no published ${channel} yet; the next release may create it.`);
        continue;
      }
      throw new Error(`npm registry has no metadata for ${package_.name}.`);
    }
    if (check && tags[channel] !== package_.version) {
      throw new Error(
        `npm ${channel} dist-tag for ${package_.name} must be ${package_.version}, found ${String(tags[channel])}.`,
      );
    }
    if (channel !== "latest" && tags.latest === package_.version) {
      throw new Error(
        `npm latest dist-tag for ${package_.name} must not point at prerelease ${package_.version}.`,
      );
    }
    if (checkPublished && !new RegExp(`-${channel}\\.\\d+$`).test(String(tags[channel]))) {
      throw new Error(`npm ${channel} dist-tag for ${package_.name} must be a ${channel} prerelease, found ${String(tags[channel])}.`);
    }
    console.log(
      check ? `Verified ${package_.name} ${channel} -> ${package_.version}` : `Verified published ${package_.name} ${channel} -> ${tags[channel]}`,
    );
    continue;
  }

  const result = spawnSync("npm", ["dist-tag", "add", specifier, channel], {
    cwd: root,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`npm dist-tag add ${specifier} ${channel} failed.`);
  }
}

if (!dryRun && !check && !checkPublished) console.log(`Synchronized ${channel} dist-tags for all @vooya packages.`);

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
