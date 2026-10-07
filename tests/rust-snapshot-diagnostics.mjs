// Public build API with the packaged Rust authoring sources. No mocked Cargo,
// WASM sections or declaration generator: unsupported schemas must survive Rust
// compilation before the declaration diagnostic can protect the last output.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApplication } from "../packages/provider-rust/dist/index.js";

const root = mkdtempSync(join(tmpdir(), "vooya-snapshot-diagnostics-"));
const file = join(root, "src/WorkflowReplay.rs");
const valid = `use vooya as voo;
#[derive(voo::ToJs, PartialEq, Clone)]
pub struct ReplaySnapshot {
    pub stage: String,
    pub history: Vec<String>,
}
#[derive(Default)]
pub struct WorkflowReplay;
#[voo::store]
impl WorkflowReplay {
    #[voo::snapshot]
    pub fn snapshot(&self) -> ReplaySnapshot {
        ReplaySnapshot { stage: "Draft".into(), history: vec![] }
    }
}
`;
const options = { applicationRoot: root, framework: "vue" };
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
function filesIn(directory) {
  return Object.fromEntries(readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? Object.entries(filesIn(path)) : [[path, hash(readFileSync(path))]];
  }));
}
try {
  mkdirSync(join(root, "src"));
  writeFileSync(file, valid);
  for (const framework of ["vue", "react", "solid", "svelte"]) {
    const result = buildApplication({ ...options, framework });
    const declaration = result.declarations[0].code;
    assert.match(declaration, /stage: string/);
    assert.match(declaration, /history: Array<string>/);
    assert.doesNotMatch(declaration, /Record<string, unknown>|Snapshot schema metadata is missing/);
  }
  const output = join(root, ".vooya");
  // Only successfully committed WASM/metadata are protected, not the generated
  // Cargo inputs and target cache which naturally change during a failed build.
  const before = { ...filesIn(join(output, "wasm")), metadata: hash(readFileSync(join(output, "metadata.json"))) };
  writeFileSync(file, valid.replace("Vec<String>", "&'static str").replace("history: vec![]", 'history: "borrowed"'));
  assert.throws(() => buildApplication(options), error => {
    assert.equal(error.kind, "snapshot-schema");
    assert.equal(error.source.file, file);
    assert.equal(error.source.line, 5);
    assert.ok(error.source.column > 0);
    assert.match(error.message, /ReplaySnapshot.history.*Unsupported Rust schema type/);
    assert.ok(error.message.startsWith(`${file}:5:`));
    return true;
  });
  assert.deepEqual({ ...filesIn(join(output, "wasm")), metadata: hash(readFileSync(join(output, "metadata.json"))) }, before);
  for (const reference of ["ReplaySnapshot", "Self"]) {
    writeFileSync(file, valid.replace("Vec<String>", `Vec<${reference}>`));
    assert.throws(() => buildApplication(options), error => {
      assert.equal(error.kind, "snapshot-schema");
      assert.equal(error.source.file, file);
      assert.equal(error.source.line, 5);
      assert.match(error.message, /Recursive Rust schema/);
      return true;
    });
    assert.deepEqual({ ...filesIn(join(output, "wasm")), metadata: hash(readFileSync(join(output, "metadata.json"))) }, before);
  }
  writeFileSync(file, valid);
  assert.match(buildApplication(options).declarations[0].code, /history: Array<string>/);
  // A manual ToJs value has no derive schema. It cannot be distinguished from
  // missing metadata by v1; do not invent a precise shape or reject valid Rust.
  writeFileSync(file, valid.replace("voo::ToJs, ", "") + `
impl voo::ToJs for ReplaySnapshot {
    fn to_js(&self) -> Result<voo::__private::wasm_bindgen::JsValue, voo::__private::wasm_bindgen::JsValue> {
        Ok(voo::__private::wasm_bindgen::JsValue::from_str(&self.stage))
    }
}
`);
  const opaque = buildApplication(options).declarations[0].code;
  assert.match(opaque, /WorkflowReplaySnapshot = unknown/);
  assert.match(opaque, /Snapshot schema metadata is missing/);
  // Existing macro rejection still reports the author's generic source span.
  writeFileSync(file, valid.replace("pub struct ReplaySnapshot {", "pub struct ReplaySnapshot<T> {").replace("pub stage: String", "pub stage: T").replace("-> ReplaySnapshot", "-> ReplaySnapshot<String>"));
  let diagnostics = "";
  const stderr = process.stderr.write;
  process.stderr.write = function(chunk, ...args) {
    diagnostics += String(chunk);
    return stderr.call(this, chunk, ...args);
  };
  try {
    assert.throws(() => buildApplication(options), error => error.kind === "cargo-build");
  } finally { process.stderr.write = stderr; }
  assert.match(diagnostics, /generic public ABI is not supported in v1/);
  assert.ok(diagnostics.includes(`${file}:3:`));
  console.log("Rust snapshot diagnostics passed: four-framework owned declarations, borrowed/recursive source errors, preserved output, recovery, opaque metadata and generic rejection.");
} finally {
  rmSync(root, { recursive: true, force: true });
}
