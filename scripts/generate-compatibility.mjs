import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const outputPath = resolve(root, "docs/reference/compatibility.md");
const allowedStatuses = new Set(["verified", "partial", "unsupported"]);
const check = process.argv.includes("--check");
const records = ["vue", "react"].map((adapter) => {
  const path = resolve(root, "packages", adapter, "compatibility.json");
  const record = JSON.parse(readFileSync(path, "utf8"));
  validate(record, path);
  for (const evidence of record.evidence) {
    if (!existsSync(resolve(root, evidence))) throw new Error(`${path}: missing evidence ${evidence}`);
  }
  return record;
});
const capabilities = [...new Set(records.flatMap((record) => Object.keys(record.capabilities)))];
const source = `${[
  "# Host Compatibility",
  "",
  "<!-- GENERATED FILE — edit packages/{vue,react}/compatibility.json and run npm run compatibility:generate. -->",
  "",
  "Vooya treats host support as a tested product contract. `verified` means the capability is covered by the linked evidence; it is not a general compatibility claim beyond the stated host version.",
  "",
  `| Host adapter | Host versions | ${capabilities.map(label).join(" | ")} | Last verified |`,
  `| --- | --- | ${capabilities.map(() => "---").join(" | ")} | --- |`,
  ...records.map(
    (record) =>
      `| \`${record.package}\` | \`${record.versionRange}\` | ${capabilities
        .map((capability) => record.capabilities[capability] ?? "unsupported")
        .join(" | ")} | ${record.verified} |`,
  ),
  "",
  "## Known gaps",
  "",
  ...records.flatMap((record) => [
    `### ${record.host}`,
    "",
    ...record.unsupported.map((item) => `- ${item}`),
    "",
    "Evidence:",
    "",
    ...record.evidence.map((path) => `- [\`${path}\`](../../${path})`),
    "",
  ]),
].join("\n")}\n`;

if (check) {
  const current = existsSync(outputPath) ? readFileSync(outputPath, "utf8") : "";
  if (current !== source) {
    throw new Error("Compatibility documentation is stale. Run npm run compatibility:generate.");
  }
  console.log(`Verified compatibility metadata for ${records.length} host adapters.`);
} else {
  writeFileSync(outputPath, source);
  console.log(`Generated ${outputPath}.`);
}

function validate(record, path) {
  if (record.schemaVersion !== 1) throw new Error(`${path}: unsupported schemaVersion`);
  for (const key of ["host", "package", "versionRange", "verified"]) {
    if (typeof record[key] !== "string" || record[key].length === 0) {
      throw new Error(`${path}: ${key} must be a non-empty string`);
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(record.verified)) {
    throw new Error(`${path}: verified must use YYYY-MM-DD`);
  }
  if (!record.capabilities || Object.keys(record.capabilities).length === 0) {
    throw new Error(`${path}: capabilities must not be empty`);
  }
  for (const [capability, status] of Object.entries(record.capabilities)) {
    if (!allowedStatuses.has(status)) throw new Error(`${path}: invalid ${capability} status ${status}`);
  }
  if (!Array.isArray(record.unsupported) || !Array.isArray(record.evidence)) {
    throw new Error(`${path}: unsupported and evidence must be arrays`);
  }
}

function label(value) {
  return value.replace(/[A-Z]/g, (match) => ` ${match.toLowerCase()}`).replace(/^./, (match) => match.toUpperCase());
}
