import assert from "node:assert/strict";
import test from "node:test";

import { buildRustComponentContracts, indexVooyaSchema, readVooyaSchema, resolveVooyaSchemaReference, RustSchemaError, validateVooyaSchemaGroups } from "../dist/schema.js";

const encoder = new TextEncoder();

function varUint32(value) {
  const bytes = [];
  do {
    let byte = value & 0x7f;
    value >>>= 7;
    if (value) byte |= 0x80;
    bytes.push(byte);
  } while (value);
  return bytes;
}

function customSection(name, record) {
  return customSectionRecords(name, [record]);
}

function customSectionRecords(name, records) {
  const nameBytes = [...encoder.encode(name)];
  const data = [...encoder.encode(`${records.map((record) => JSON.stringify(record)).join("\n")}\n`)];
  const payload = [...varUint32(nameBytes.length), ...nameBytes, ...data];
  return [0, ...varUint32(payload.length), ...payload];
}

function wasm(...sections) {
  return new Uint8Array([
    0, 0x61, 0x73, 0x6d, 1, 0, 0, 0,
    ...sections.flat(),
  ]);
}

function rawCustomSection(name, dataText) {
  const nameBytes = [...encoder.encode(name)];
  const data = [...encoder.encode(dataText)];
  const payload = [...varUint32(nameBytes.length), ...nameBytes, ...data];
  return [0, ...varUint32(payload.length), ...payload];
}

test("reads versioned records from repeated Vooya custom sections", () => {
  const bytes = wasm(
    customSection("__voo_schema", {
      version: 1,
      kind: "props",
      id: "cart::Props",
      name: "CartProps",
      fields: [{ name: "count", type: "u32" }],
    }),
    customSection("other", { ignored: true }),
    customSection("__voo_schema", {
      version: 1,
      kind: "component",
      id: "cart::Cart",
      name: "Cart",
      params: [{ name: "props", type: "CartProps" }],
      return: "Result<ViewElement,JsValue>",
    }),
  );

  const schema = readVooyaSchema(bytes);
  assert.equal(schema.version, 1);
  assert.deepEqual(schema.records.map((record) => record.kind), ["props", "component"]);
  assert.equal(schema.records[0].id, "cart::Props");
  const index = indexVooyaSchema(schema);
  assert.equal(index.components.length, 1);
  assert.equal(resolveVooyaSchemaReference(index, "CartProps", "props").id, "cart::Props");
  assert.equal(buildRustComponentContracts(index)[0].props.name, "CartProps");
  validateVooyaSchemaGroups(index);
});

test("reads multiple newline-delimited records merged into one custom section", () => {
  const bytes = wasm(customSectionRecords("__voo_schema", [
    { version: 1, kind: "props", id: "cart::Props", name: "Props", fields: [] },
    { version: 1, kind: "component", id: "cart::Cart", name: "Cart", params: [], return: "()" },
  ]));
  assert.equal(readVooyaSchema(bytes).records.length, 2);
});

test("rejects duplicate records and mismatched versions", () => {
  const record = {
    version: 1,
    kind: "store",
    id: "cart::Store",
    name: "Store",
    actions: [],
  };
  assert.throws(
    () => readVooyaSchema(wasm(customSection("__voo_schema", record), customSection("__voo_schema", record))),
    (error) => error instanceof RustSchemaError && /duplicate schema record store:cart::Store/.test(error.message),
  );
  assert.throws(
    () => readVooyaSchema(wasm(customSection("__voo_schema", { ...record, version: 2 }))),
    (error) => error instanceof RustSchemaError && /uses version 2; expected 1/.test(error.message),
  );
});

test("reports malformed section boundaries and records", () => {
  assert.throws(
    () => readVooyaSchema(new Uint8Array([0, 0x61, 0x73, 0x6d, 2, 0, 0, 0])),
    (error) => error instanceof RustSchemaError && /unsupported WASM binary version/.test(error.message),
  );
  assert.throws(
    () => readVooyaSchema(new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0, 0, 4, 1])),
    (error) => error instanceof RustSchemaError && /extends beyond/.test(error.message),
  );
  assert.throws(
    () => readVooyaSchema(wasm(customSection("__voo_schema", { version: 1, kind: "props" }))),
    (error) => error instanceof RustSchemaError && /not a supported record/.test(error.message),
  );
});

test("rejects ambiguous short schema references", () => {
  const schema = {
    version: 1,
    records: [
      { version: 1, kind: "props", id: "a::Props", name: "Props", fields: [] },
      { version: 1, kind: "props", id: "b::Props", name: "Props", fields: [] },
    ],
  };
  assert.throws(
    () => resolveVooyaSchemaReference(indexVooyaSchema(schema), "Props", "props"),
    (error) => error instanceof RustSchemaError && /ambiguous/.test(error.message),
  );
});

test("rejects more than one role record of the same kind in a file group", () => {
  const schema = indexVooyaSchema({
    version: 1,
    records: [
      { version: 1, kind: "component", id: "a::One", name: "One", group: "src/One.rs", params: [] },
      { version: 1, kind: "component", id: "a::Two", name: "Two", group: "src/One.rs", params: [] },
    ],
  });
  assert.throws(
    () => validateVooyaSchemaGroups(schema),
    (error) => error instanceof RustSchemaError && /contains multiple component/.test(error.message),
  );
});

test("rejects invalid LEB128 section lengths", () => {
  // Fifth byte sets bits beyond u32 -> overflow.
  const overflow = new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0, 0, 0x80, 0x80, 0x80, 0x80, 0x7f]);
  assert.throws(
    () => readVooyaSchema(overflow),
    (error) => error instanceof RustSchemaError && /section length near byte 8 overflows u32/.test(error.message),
  );
  // Five continuation bytes never terminate -> not a valid u32.
  const unterminated = new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0, 0, 0x80, 0x80, 0x80, 0x80, 0x80]);
  assert.throws(
    () => readVooyaSchema(unterminated),
    (error) => error instanceof RustSchemaError && /section length near byte 8 is not a valid u32/.test(error.message),
  );
});

test("rejects an invalid JSON schema record", () => {
  const bytes = new Uint8Array([
    0, 0x61, 0x73, 0x6d, 1, 0, 0, 0,
    ...rawCustomSection("__voo_schema", '{"version":1,'),
  ]);
  assert.throws(
    () => readVooyaSchema(bytes),
    (error) => error instanceof RustSchemaError && /record 1, is not valid JSON/.test(error.message),
  );
});

test("rejects a schema record missing its version", () => {
  const bytes = wasm(customSection("__voo_schema", { kind: "props", id: "A", name: "A", fields: [] }));
  assert.throws(
    () => readVooyaSchema(bytes),
    (error) => error instanceof RustSchemaError && /is missing a schema version/.test(error.message),
  );
});

test("rejects a schema record with a non-integer version", () => {
  const bytes = wasm(customSection("__voo_schema", { version: "1", kind: "props", id: "A", name: "A", fields: [] }));
  assert.throws(
    () => readVooyaSchema(bytes),
    (error) => error instanceof RustSchemaError && /has an invalid schema version/.test(error.message),
  );
});
