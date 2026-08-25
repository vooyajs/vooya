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
let publishedAlpha;

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
    const result = spawnSync("npm", ["view", package_.name, "dist-tags", "--json"], {
      cwd: root,
      encoding: "utf8",
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      if (checkPublished && isUnpublishedPackage(result.stdout, result.stderr)) {
        console.log(`Verified ${package_.name} has no published alpha yet; the next release may create it.`);
        continue;
      }
      throw new Error(`npm view ${package_.name} dist-tags failed.`);
    }
    const tags = JSON.parse(result.stdout);
    if (check && tags.alpha !== package_.version) {
      throw new Error(
        `npm alpha dist-tag for ${package_.name} must be ${package_.version}, found ${String(tags.alpha)}.`,
      );
    }
    if (checkPublished && !/-alpha\.\d+$/.test(String(tags.alpha))) {
      throw new Error(`npm alpha dist-tag for ${package_.name} must be an alpha prerelease, found ${String(tags.alpha)}.`);
    }
    if (checkPublished && publishedAlpha && tags.alpha !== publishedAlpha) {
      throw new Error(
        `npm alpha dist-tags must agree across the fixed package group: expected ${publishedAlpha}, found ${package_.name}@${String(tags.alpha)}.`,
      );
    }
    if (checkPublished) publishedAlpha = tags.alpha;
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

function isUnpublishedPackage(stdout: string, stderr: string): boolean {
  return /(?:\bE404\b|404 Not Found)/.test(`${stdout}\n${stderr}`);
}
