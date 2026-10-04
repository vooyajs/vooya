import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readReleaseLine } from "./release-channel.js";
import { readChangesets } from "./release-model.js";

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--root" || !args[1])) throw new Error("Usage: verify-changesets [--root path]");
const root = args.length ? resolve(args[1]) : fileURLToPath(new URL("../..", import.meta.url));
readReleaseLine(root);
console.log(`Verified ${readChangesets(root).length} package-scoped Changesets changeset(s).`);
