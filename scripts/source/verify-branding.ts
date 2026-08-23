import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: root },
)
  .toString()
  .split("\0")
  .filter(Boolean)
  .filter((file) => file !== "scripts/source/verify-branding.ts");
// Match the retired standalone spelling without flagging normal words such as
// "voyage" that happen to contain the same character sequence.
const legacyPattern = /\b(?:VOYA|Voya|voya)\b/g;
const failures = [];

for (const file of files) {
  const path = resolve(root, file);
  if (!existsSync(path)) continue;
  const buffer = readFileSync(path);
  if (buffer.includes(0)) continue;
  const source = buffer.toString("utf8");

  for (const match of source.matchAll(legacyPattern)) {
    const line = source.slice(0, match.index).split(/\r?\n/).length;
    failures.push(`${file}:${line}: ${match[0]}`);
  }
}

if (failures.length > 0) {
  throw new Error(`Legacy brand spelling remains:\n${failures.join("\n")}`);
}

console.log("Verified Vooya brand and vooya runtime identifiers.");
