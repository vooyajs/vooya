// Documentation parsing reports user-authored content failures; preserve its
// tolerant runtime error boundary while authoring the script in TypeScript.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const docsRoot = resolve(root, "docs");
type ClaimEvidence = { kind: string; value: string };
type Claim = Record<string, unknown>;
type ClaimIndex = { version: number; claims: unknown[] };
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
verifyClaimEvidence();
if (failures.length > 0) throw new Error(`Documentation verification failed:\n${failures.join("\n")}`);

console.log(`Verified ${files.length} Markdown files, their links, and ${rustExamples} Rust-file examples.`);

function markdownFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return extname(entry.name) === ".md" ? [path] : [];
  });
}

function verifyLinks(file: string, source: string): void {
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

function relativePath(file: string): string {
  return file.slice(root.length + 1);
}

function verifyClaimEvidence(): void {
  const indexPath = resolve(docsRoot, "project/claim-evidence.json");
  let index: unknown;
  try {
    index = JSON.parse(readFileSync(indexPath, "utf8"));
  } catch {
    failures.push("docs/project/claim-evidence.json: invalid JSON.");
    return;
  }
  if (!isClaimIndex(index)) {
    failures.push("docs/project/claim-evidence.json: expected version 1 with a claims array.");
    return;
  }
  const packageScripts: unknown = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).scripts;
  const scripts = packageScripts && typeof packageScripts === "object" ? packageScripts as Record<string, unknown> : {};
  const ids = new Set<string>();
  const statuses = new Set(["published", "current-source", "experimental", "retired", "not-supported", "research"]);
  for (const [position, claim] of index.claims.entries()) {
    const label = `docs/project/claim-evidence.json: claim ${position + 1}`;
    if (!isClaim(claim)) { failures.push(`${label}: expected an object.`); continue; }
    if (typeof claim.id !== "string" || !/^[a-z0-9-]+$/.test(claim.id) || ids.has(claim.id)) failures.push(`${label}: id must be unique lowercase kebab-case.`);
    else ids.add(claim.id);
    if (typeof claim.statement !== "string" || !claim.statement.trim()) failures.push(`${label}: statement is required.`);
    if (typeof claim.status !== "string" || !statuses.has(claim.status)) failures.push(`${label}: unknown status ${String(claim.status)}.`);
    if (typeof claim.scope !== "string" || !claim.scope.trim()) failures.push(`${label}: scope is required.`);
    if (typeof claim.owner !== "string" || !claim.owner.trim()) failures.push(`${label}: owner is required.`);
    if (typeof claim.reviewed !== "string" || !claim.reviewed.trim()) failures.push(`${label}: reviewed is required.`);
    if (!Array.isArray(claim.documents) || claim.documents.length === 0) failures.push(`${label}: at least one canonical document is required.`);
    else for (const document of claim.documents) verifyEvidencePath(label, "document", document);
    if (!Array.isArray(claim.evidence) || claim.evidence.length === 0) { failures.push(`${label}: at least one evidence reference is required.`); continue; }
    for (const evidence of claim.evidence) {
      if (!evidence || typeof evidence !== "object" || Array.isArray(evidence) || typeof evidence.kind !== "string" || typeof evidence.value !== "string") { failures.push(`${label}: evidence must have string kind and value.`); continue; }
      if (evidence.kind === "command") {
        if (!Object.hasOwn(scripts, evidence.value)) failures.push(`${label}: unknown npm script ${evidence.value}.`);
      } else if (evidence.kind === "document") verifyEvidencePath(label, "evidence", evidence.value);
      else if (evidence.kind === "issue" || evidence.kind === "release") {
        if (!/^https:\/\//.test(evidence.value)) failures.push(`${label}: ${evidence.kind} evidence must be an HTTPS URL.`);
      } else failures.push(`${label}: unknown evidence kind ${evidence.kind}.`);
    }
    if (claim.status === "retired" && !claim.evidence.some((evidence: unknown) => isClaimEvidence(evidence) && evidence.kind === "document")) failures.push(`${label}: retired claims require a local retirement record.`);
  }
}

function isClaimIndex(value: unknown): value is ClaimIndex {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && "version" in value && typeof value.version === "number"
    && "claims" in value && Array.isArray(value.claims);
}

function isClaim(value: unknown): value is Claim {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isClaimEvidence(value: unknown): value is ClaimEvidence {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && "kind" in value && typeof value.kind === "string"
    && "value" in value && typeof value.value === "string";
}

function verifyEvidencePath(label: string, kind: string, value: unknown): void {
  if (typeof value !== "string" || !value.startsWith("docs/") || !existsSync(resolve(root, value))) failures.push(`${label}: ${kind} must reference an existing docs path.`);
}
