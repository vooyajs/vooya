import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

import { generatedCargoManifest, remapRustDiagnostic, resolveRustDependencyRoots, resolveRuntimeCrateRoot, resolveVooyaCrateRoot, readVooSchema } from "../dist/index.js";

test("exposes a bundler-neutral runtime and dependency watch roots", () => {
  assert.equal(existsSync(`${resolveRuntimeCrateRoot()}/Cargo.toml`), true);
  assert.equal(existsSync(`${resolveVooyaCrateRoot()}/Cargo.toml`), true);
  assert.deepEqual(resolveRustDependencyRoots({ dependencies: { shared: { path: "rust/shared" } } }, "/consumer"), ["/consumer/rust/shared"]);
});

test("build manifest keeps compiler-managed dependencies pinned", () => {
  const manifest = generatedCargoManifest({ applicationRoot: "/consumer", runtimeCrateRoot: "/runtime", rust: { dependencies: { serde: { version: "1", features: ["derive"] } } } });
  assert.match(manifest, /vooya-core = \{ path = "\/runtime" \}/);
  assert.match(manifest, /wasm-bindgen = "=0\.2\.115"/);
  assert.match(manifest, /"serde" = \{ version = "1", features = \["derive"\] \}/);
  assert.throws(() => generatedCargoManifest({ applicationRoot: "/consumer", runtimeCrateRoot: "/runtime", rust: { dependencies: { "web-sys": "1" } } }), /managed by Vooya/);
});

test("build manifest adds the vooya runtime crate for Rust-file components", () => {
  const manifest = generatedCargoManifest({ applicationRoot: "/consumer", runtimeCrateRoot: "/runtime", vooyaCrateRoot: "/vooya" });
  assert.match(manifest, /vooya = \{ path = "\/vooya" \}/);
  const baseline = generatedCargoManifest({ applicationRoot: "/consumer", runtimeCrateRoot: "/runtime" });
  assert.doesNotMatch(baseline, /vooya = /);
});

test("reads __voo_schema records from a wasm custom section", () => {
  const record = '{"kind":"store","name":"Cart","props":"CartProps","export":"VooyaCartStore"}\n';
  const bytes = wasmWithCustomSection("__voo_schema", record);
  const schema = readVooSchema(bytes);
  assert.equal(schema.length, 1);
  assert.equal(schema[0].kind, "store");
  assert.equal(schema[0].name, "Cart");
});

function wasmWithCustomSection(name, payload) {
  const encoder = new TextEncoder();
  const nameBytes = encoder.encode(name);
  const payloadBytes = encoder.encode(payload);
  const nameLength = varuint(nameBytes.length);
  const section = [
    0,
    ...varuint(nameLength.length + nameBytes.length + payloadBytes.length),
    ...nameLength,
    ...nameBytes,
    ...payloadBytes,
  ];
  return new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, ...section]);
}

function varuint(value) {
  const bytes = [];
  while (true) {
    let byte = value & 0x7f;
    value >>>= 7;
    if (value !== 0) byte |= 0x80;
    bytes.push(byte);
    if (value === 0) return bytes;
  }
}

test("maps Cargo diagnostics using compiler source location metadata", () => {
  const generated = "/project/cache/src/components/0-Counter.rs";
  const diagnostic = remapRustDiagnostic({ level: "error", message: "missing", rendered: `error\n --> ${generated}:4:9\n  |\n4 | missing\n`, spans: [{ file_name: generated, line_start: 4, column_start: 9 }] }, new Map([[generated, { id: "/project/src/Counter.voo", startLine: 10, generatedLineOffset: 1 }]]));
  assert.match(diagnostic, /\/project\/src\/Counter\.voo:12:9/);
  assert.match(diagnostic, /12 \| missing/);
});
