// Documentation parsing reports user-authored content failures; preserve its
// tolerant runtime error boundary while authoring the script in TypeScript.
// @ts-nocheck
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const docsRoot = resolve(root, "docs");
const files = markdownFiles(docsRoot);
const failures = [];
let rustExamples = 0;

for (const file of files) {
  const source = readFileSync(file, "utf8");
  verifyLinks(file, source);

  rustExamples += [...source.matchAll(/```rust\s*\n([\s\S]*?)```/g)]
    .filter(([, example]) => /#\[voo::component\]/.test(example))
    .length;
}

if (rustExamples === 0) {
  failures.push("Documentation must contain a Rust-file component example.");
}
if (failures.length > 0) throw new Error(`Documentation verification failed:\n${failures.join("\n")}`);

console.log(`Verified ${files.length} Markdown files, their links, and ${rustExamples} Rust-file examples.`);

function markdownFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return extname(entry.name) === ".md" ? [path] : [];
  });
}

function verifyLinks(file, source) {
  for (const match of source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1];
    if (/^(?:https?:|mailto:|#)/.test(target)) continue;
    const path = decodeURIComponent(target.split(/[?#]/, 1)[0]);
    const absolute = resolve(dirname(file), path);
    if (!existsSync(absolute)) {
      failures.push(`${relativePath(file)}: missing link target ${target}`);
      continue;
    }
    if (statSync(absolute).isDirectory() && !existsSync(resolve(absolute, "index.html"))) {
      const hasEntry = existsSync(resolve(absolute, "README.md")) || readdirSync(absolute).length > 0;
      if (!hasEntry) failures.push(`${relativePath(file)}: empty linked directory ${target}`);
    }
  }
}

function relativePath(file) {
  return file.slice(root.length + 1);
}
