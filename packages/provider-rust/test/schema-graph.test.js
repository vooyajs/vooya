import assert from "node:assert/strict";
import test from "node:test";
import { generateRustSchemaDeclaration, generateRustStoreDeclaration } from "../dist/schema-declarations.js";
import { renderRustComponentModule } from "../dist/rust-modules.js";
import { readVooyaSchema } from "../dist/schema.js";

const scalar = name => ({ kind: "scalar", name });
const named = (identity, direction = "from") => ({ kind: "named", identity, direction });
const field = (name, abi) => ({ name, type: "AuthorAlias", abi });
const type = (identity, fields, direction = "from") => ({
  version: 2, kind: "type", id: `${identity}:${direction}`, identity,
  name: identity.split("::").at(-1), group: "src/same.rs", direction,
  shape: { kind: "struct", fields },
});
const contract = (fields, params = []) => ({
  component: { version: 2, kind: "component", id: "Panel", name: "Panel", params: [] },
  props: { version: 2, kind: "props", id: "Props", name: "Props", fields },
  events: { version: 2, kind: "events", id: "Events", name: "Events", methods: [{ name: "selected", params }] },
});
const store = abi => ({ version: 2, kind: "store", id: "Replay", name: "Replay", snapshot: "SnapshotAlias", snapshotAbi: abi, actions: [] });
const frameworks = ["vue", "react", "solid", "svelte"];

test("resolved identities survive aliases, same-file collisions and record ordering", () => {
  const types = [type("app::left::Selection", [field("id", scalar("u64"))]), type("app::right::Selection", [field("label", scalar("String"))]), type("app::unused::Other", [])];
  const input = contract([field("left", named(types[0].identity)), field("right", named(types[1].identity))]);
  for (const framework of frameworks) {
    const code = generateRustSchemaDeclaration({ contract: input, framework, types });
    assert.match(code, /left: LeftSelection/);
    assert.match(code, /right: RightSelection/);
    assert.match(code, /id: bigint/);
    assert.match(code, /label: string/);
    assert.doesNotMatch(code, /export interface Other/);
    assert.equal(code, generateRustSchemaDeclaration({ contract: input, framework, types: [...types].reverse() }));
  }
});

test("coalesces equal conversion graphs but preserves directional nested differences", () => {
  for (const equal of [true, false]) {
    const types = [
      ...["from", "to"].map(direction => type("app::Value", [field("child", named("app::Child", direction))], direction)),
      type("app::Child", [field("id", scalar("u32"))]),
      type("app::Child", [field("id", scalar(equal ? "u32" : "String"))], "to"),
    ];
    for (const framework of frameworks) {
      const code = generateRustSchemaDeclaration({ contract: contract([field("value", named("app::Value"))], [field("value", named("app::Value", "to"))]), framework, types });
      if (equal) {
        assert.equal((code.match(/export interface Value /g) ?? []).length, 1);
        assert.doesNotMatch(code, /ValueInput|ValueOutput/);
      } else {
        assert.match(code, /ValueInput/);
        assert.match(code, /ValueOutput/);
        assert.match(code, /child: ChildInput/);
        assert.match(code, /child: ChildOutput/);
      }
      assert.equal(code, generateRustSchemaDeclaration({ contract: contract([field("value", named("app::Value"))], [field("value", named("app::Value", "to"))]), framework, types: [...types].reverse() }));
    }
  }
});

test("equal shapes from different identities remain separate", () => {
  const types = [type("app::a::Value", []), type("app::b::Value", [])];
  const code = generateRustSchemaDeclaration({ contract: contract(types.map(t => field(t.identity.includes("::a::") ? "a" : "b", named(t.identity)))), framework: "vue", types });
  assert.match(code, /a: AValue/);
  assert.match(code, /b: BValue/);
});

test("missing explicit metadata never falls back to a matching short name or input direction", () => {
  const types = [type("app::wrong::Value", [])];
  assert.throws(() => generateRustSchemaDeclaration({ contract: contract([field("value", named("app::right::Value"))]), framework: "vue", types }), /missing conversion metadata for app::right::Value/);
  assert.throws(() => generateRustStoreDeclaration(store(named("app::wrong::Value", "to")), "vue", types), /missing conversion metadata.*\(to\)/);
  const code = generateRustStoreDeclaration(store({ kind: "opaque" }), "vue", types);
  assert.match(code, /ReplaySnapshot = unknown/);
  assert.doesNotMatch(code, /interface Value/);
});

test("validates snapshot graph cycles at their source and rejects missing nested metadata", () => {
  const source = { file: "src/weird.rs", line: 17, column: 4 };
  const node = type("app::Node", [{ ...field("children", { kind: "vec", value: named("app::Node", "to") }), source }], "to");
  assert.throws(() => generateRustStoreDeclaration(store(named(node.identity, "to")), "vue", [node]), error => {
    assert.equal(error.kind, "snapshot-schema");
    assert.deepEqual(error.source, source);
    assert.match(error.message, /SnapshotAlias.children.*Recursive/);
    return true;
  });
  node.shape.fields[0].abi.value.identity = "app::Missing";
  assert.throws(() => generateRustStoreDeclaration(store(named(node.identity, "to")), "vue", [node]), /missing conversion metadata.*app::Missing/);
});

test("runtime categories and optionality use resolved containers and scalars", () => {
  const input = contract([field("count", scalar("u32")), field("label", { kind: "option", value: scalar("String") }), field("items", { kind: "vec", value: scalar("u64") })]);
  for (const framework of frameworks) {
    const code = generateRustSchemaDeclaration({ contract: input, framework });
    assert.match(code, /count: number/);
    assert.match(code, /label\?: string \| null/);
    assert.match(code, /items: Array<bigint>/);
    const module = renderRustComponentModule(input, framework, "Panel", { runtimeModule: "./app.js", runtimeHelpers: "@vooya/core" });
    assert.match(module, /"name":"count","type":"number","required":true/);
    assert.match(module, /"name":"label","type":"string","required":false/);
    assert.match(module, /"name":"items","type":"array","required":true/);
  }
});

function wasm(records) {
  const leb = number => { const bytes = []; do { const next = number & 127; number >>>= 7; bytes.push(next | (number ? 128 : 0)); } while (number); return bytes; };
  const name = Buffer.from("__voo_schema");
  const body = Buffer.concat([Buffer.from(leb(name.length)), name, Buffer.from(records.map(r => JSON.stringify(r)).join("\n"))]);
  return Buffer.concat([Buffer.from([0, 97, 115, 109, 1, 0, 0, 0, 0, ...leb(body.length)]), body]);
}
test("reader validates v2 descriptors and logical duplicate identities", () => {
  const valid = type("app::Value", [field("id", scalar("u32"))]);
  assert.equal(readVooyaSchema(wasm([valid])).version, 2);
  for (const abi of [undefined, null, {}, scalar("fake"), named("", "from"), named("app::Value", "wrong"), { kind: "tuple", items: [scalar("u32")] }]) {
    assert.throws(() => readVooyaSchema(wasm([{ ...valid, shape: { kind: "struct", fields: [field("id", abi)] } }])), /not a supported record/);
  }
  let deep = scalar("u32");
  for (let i = 0; i < 150; i++) deep = { kind: "option", value: deep };
  assert.throws(() => readVooyaSchema(wasm([{ ...valid, shape: { kind: "struct", fields: [field("id", deep)] } }])), /not a supported record/);
  assert.throws(() => readVooyaSchema(wasm([valid, { ...valid, id: "a different record id" }])), /duplicate schema record/);
});


test("named payloads cannot collide with generated component props or events", () => {
  const types = [type("app::PanelProps", [field("value", scalar("u32"))], "to")];
  for (const framework of frameworks) {
    const code = generateRustSchemaDeclaration({ contract: contract([], [field("value", named("app::PanelProps", "to"))]), framework, types });
    assert.match(code, /export interface AppPanelProps/);
    assert.match(code, /value: AppPanelProps/);
    assert.doesNotMatch(code, /export interface PanelProps/);
  }
});
