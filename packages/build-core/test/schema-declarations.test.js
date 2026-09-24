import assert from "node:assert/strict";
import test from "node:test";

import {
  generateRustSchemaDeclaration,
  generateRustStoreDeclaration,
  rustTypeToRuntimeType,
  rustTypeToTypeScript,
} from "../dist/schema-declarations.js";

test("maps ABI v1 Rust types to TypeScript without losing bigint precision", () => {
  for (const type of ["i8", "u8", "i16", "u16", "i32", "u32", "isize", "usize", "f32", "f64"]) {
    assert.equal(rustTypeToTypeScript(type), "number", type);
    assert.equal(rustTypeToRuntimeType(type), "number", type);
  }
  for (const type of ["i64", "u64", "i128", "u128"]) {
    assert.equal(rustTypeToTypeScript(type), "bigint", type);
    assert.equal(rustTypeToRuntimeType(type), "bigint", type);
  }
  assert.equal(rustTypeToTypeScript("u32"), "number");
  assert.equal(rustTypeToTypeScript("u128"), "bigint");
  assert.equal(rustTypeToTypeScript("Option<Vec<String>>"), "Array<string> | null");
  assert.equal(rustTypeToTypeScript("(u32, Option<String>)"), "[number, string | null]");
  assert.equal(rustTypeToTypeScript("HashMap<String, u64>"), "Record<string, bigint>");
  assert.throws(() => rustTypeToTypeScript("HashMap<u32, String>"), /Unsupported map key type/);
  assert.throws(() => rustTypeToTypeScript("&str"), /Unsupported Rust schema type/);
  assert.throws(() => rustTypeToTypeScript("Vec<T, U>"), /Unsupported Rust schema type/);
  assert.equal(rustTypeToRuntimeType("Option<u128>"), "bigint");
  assert.equal(rustTypeToRuntimeType("(u32, Option<String>)"), "array");
  assert.equal(rustTypeToRuntimeType("BTreeMap<String, u64>"), "object");
});

test("generates Vue declarations from a Rust component contract", () => {
  const code = generateRustSchemaDeclaration({
    framework: "vue",
    contract: {
      component: { version: 1, kind: "component", id: "cart::Cart", name: "Cart", params: [] },
      props: {
        version: 1,
        kind: "props",
        id: "cart::Props",
        name: "Props",
        fields: [
          { name: "total", type: "u128" },
          { name: "coupon", type: "Option<String>" },
        ],
      },
      events: {
        version: 1,
        kind: "events",
        id: "cart::Events",
        name: "Events",
        methods: [{ name: "checked-out", params: [{ name: "order", type: "u64" }] }],
      },
    },
  });
  assert.match(code, /total: bigint/);
  assert.match(code, /coupon\?: string \| null/);
  assert.match(code, /"checked-out": \(order: bigint\) => void/);
  assert.match(code, /error: \(error: \{ stage: "load" \| "mount" \| "update" \| "dispose"; cause: unknown \}\) => void/);
  assert.match(code, /DefineComponent/);
});

test("generates React declarations exposing the four-stage error union", () => {
  const code = generateRustSchemaDeclaration({
    framework: "react",
    contract: {
      component: { version: 1, kind: "component", id: "cart::Cart", name: "Cart", params: [] },
      props: {
        version: 1,
        kind: "props",
        id: "cart::Props",
        name: "Props",
        fields: [{ name: "total", type: "u32" }],
      },
      events: {
        version: 1,
        kind: "events",
        id: "cart::Events",
        name: "Events",
        methods: [{ name: "checked-out", params: [{ name: "order", type: "u64" }] }],
      },
    },
  });
  assert.match(code, /import type \{ ComponentType \} from "react"/);
  assert.match(code, /onCheckedOut\?: \(order: bigint\) => void/);
  assert.match(code, /onError\?: \(error: \{ stage: "load" \| "mount" \| "update" \| "dispose"; cause: unknown \}\) => void/);
});

test("generates named struct and enum declarations for ABI schema types", () => {
  const contract = {
    component: { version: 1, kind: "component", id: "cart::Cart", name: "Cart", params: [] },
    props: { version: 1, kind: "props", id: "cart::Props", name: "Props", fields: [{ name: "selection", type: "Selection" }] },
    events: { version: 1, kind: "events", id: "cart::Events", name: "Events", methods: [{ name: "changed", params: [{ name: "limit", type: "Limit" }] }] },
  };
  const types = [
    { version: 1, kind: "type", id: "Selection:from", name: "Selection", direction: "from", shape: { kind: "struct", fields: [{ name: "id", type: "i32" }, { name: "tags", type: "Vec<String>" }] } },
    { version: 1, kind: "type", id: "Selection:to", name: "Selection", direction: "to", shape: { kind: "struct", fields: [{ name: "id", type: "i32" }, { name: "tags", type: "Vec<String>" }] } },
    { version: 1, kind: "type", id: "Limit:to", name: "Limit", direction: "to", shape: { kind: "enum", variants: ["Reached", "Rejected"] } },
  ];
  const vue = generateRustSchemaDeclaration({ framework: "vue", contract, types });
  const react = generateRustSchemaDeclaration({ framework: "react", contract, types });
  for (const code of [vue, react]) {
    assert.match(code, /export interface Selection/);
    assert.match(code, /id: number/);
    assert.match(code, /tags: Array<string>/);
    assert.match(code, /export type Limit = \{ type: "Reached" \} \| \{ type: "Rejected" \}/);
    assert.match(code, /selection: Selection/);
  }
  assert.match(react, /onChanged\?: \(limit: Limit\) => void/);
});

test("emits only types reachable from a component contract", () => {
  const code = generateRustSchemaDeclaration({
    framework: "vue",
    contract: {
      component: { version: 1, kind: "component", id: "cart::Cart", name: "Cart", params: [] },
      props: { version: 1, kind: "props", id: "cart::Props", name: "Props", fields: [{ name: "selection", type: "Selection" }] },
    },
    types: [
      { version: 1, kind: "type", id: "Selection:from", name: "Selection", direction: "from", shape: { kind: "struct", fields: [{ name: "id", type: "i32" }] } },
      { version: 1, kind: "type", id: "Unused:to", name: "Unused", direction: "to", shape: { kind: "struct", fields: [{ name: "ignored", type: "String" }] } },
    ],
  });
  assert.match(code, /export interface Selection/);
  assert.doesNotMatch(code, /export interface Unused/);
});

test("keeps known component fields precise when a named payload has no schema", () => {
  const contract = {
    component: { version: 1, kind: "component", id: "cart::Cart", name: "Cart", params: [] },
    props: { version: 1, kind: "props", id: "cart::Props", name: "Props", fields: [
      { name: "count", type: "u32" },
      { name: "selection", type: "Option<Selection>" },
    ] },
    events: { version: 1, kind: "events", id: "cart::Events", name: "Events", methods: [
      { name: "changed", params: [{ name: "payload", type: "OpaquePayload" }] },
    ] },
  };
  for (const framework of ["vue", "react"]) {
    const code = generateRustSchemaDeclaration({ framework, contract });
    assert.match(code, /count: number/);
    assert.match(code, /selection\?: unknown \| null/);
    assert.doesNotMatch(code, /selection\?: Selection/);
    assert.doesNotMatch(code, /payload: OpaquePayload/);
    assert.match(code, /payload: unknown/);
  }
});

test("keeps a derived interface precise while falling back at an opaque nested field", () => {
  const code = generateRustSchemaDeclaration({
    framework: "vue",
    contract: {
      component: { version: 1, kind: "component", id: "cart::Cart", name: "Cart", params: [] },
      props: { version: 1, kind: "props", id: "cart::Props", name: "Props", fields: [{ name: "selection", type: "Selection" }] },
    },
    types: [{ version: 1, kind: "type", id: "Selection:from", name: "Selection", direction: "from", shape: {
      kind: "struct", fields: [{ name: "id", type: "u32" }, { name: "detail", type: "Vec<OpaquePayload>" }],
    } }],
  });
  assert.match(code, /export interface Selection/);
  assert.match(code, /id: number/);
  assert.match(code, /detail: Array<unknown>/);
  assert.match(code, /selection: Selection/);
});

test("uses an object fallback only when a derived struct schema proves the shape", () => {
  const code = generateRustSchemaDeclaration({
    framework: "vue",
    contract: {
      component: { version: 1, kind: "component", id: "cart::Cart", name: "Cart", params: [] },
      props: { version: 1, kind: "props", id: "cart::Props", name: "Props", fields: [{ name: "selection", type: "Selection" }] },
    },
    types: [{ version: 1, kind: "type", id: "Selection:from", name: "Selection", direction: "from", shape: {
      kind: "struct", fields: [{ name: "borrowed", type: "&str" }],
    } }],
  });
  assert.match(code, /export type Selection = Record<string, unknown>;/);
  assert.match(code, /selection: Selection/);
});

test("rejects same-named reachable types from different source groups", () => {
  const contract = {
    component: { version: 1, kind: "component", id: "cart::Cart", name: "Cart", params: [] },
    props: { version: 1, kind: "props", id: "cart::Props", name: "Props", fields: [{ name: "selection", type: "Selection" }] },
  };
  assert.throws(() => generateRustSchemaDeclaration({
    framework: "vue",
    contract,
    types: [
      { version: 1, kind: "type", id: "models:Selection:from", name: "Selection", group: "src/models.rs", direction: "from", shape: { kind: "struct", fields: [{ name: "id", type: "i32" }] } },
      { version: 1, kind: "type", id: "filters:Selection:from", name: "Selection", group: "src/filters.rs", direction: "from", shape: { kind: "struct", fields: [{ name: "query", type: "String" }] } },
    ],
  }), /Candidates are declared in: src\/models\.rs, src\/filters\.rs/);
});

test("generates Solid declarations from the same Rust component contract", () => {
  const code = generateRustSchemaDeclaration({
    framework: "solid",
    contract: {
      component: { version: 1, kind: "component", id: "cart::Cart", name: "Cart", params: [] },
      props: { version: 1, kind: "props", id: "cart::Props", name: "Props", fields: [{ name: "total", type: "u32" }] },
      events: {
        version: 1,
        kind: "events",
        id: "cart::Events",
        name: "Events",
        methods: [{ name: "checked-out", params: [{ name: "order", type: "u64" }] }],
      },
    },
  });
  assert.match(code, /import type \{ Component \} from "solid-js"/);
  assert.match(code, /onCheckedOut\?: \(order: bigint\) => void/);
  assert.match(code, /class\?: string/);
});

test("generates framework-specific Rust store exports", () => {
  const store = {
    version: 1,
    kind: "store",
    id: "cart::Cart",
    name: "Cart",
    group: "src/Store.rs",
    snapshot: "CartSnapshot",
    actions: [{ name: "add", params: [{ name: "amount", type: "u32" }] }],
  };

  const types = [{
    version: 1,
    kind: "type",
    id: "src/Store.rs:CartSnapshot:to",
    name: "CartSnapshot",
    group: "src/Store.rs",
    direction: "to",
    shape: { kind: "struct", fields: [{ name: "count", type: "u32" }, { name: "history", type: "Vec<String>" }] },
  }];

  const vue = generateRustStoreDeclaration(store, "vue", types);
  assert.match(vue, /VooyaStoreOptions/);
  assert.match(vue, /import type \{ Ref \} from "vue"/);
  assert.match(vue, /export declare function createCartStore\(\): Promise<CartStore>;/);
  assert.match(vue, /export default createCartStore;/);
  assert.match(vue, /export declare function useCart\(options\?: VooyaStoreOptions\)/);
  assert.match(vue, /state: Readonly<Ref<CartSnapshot \| undefined>>/);

  const react = generateRustStoreDeclaration(store, "react", types);
  assert.match(react, /export interface CartSnapshot/);
  assert.match(react, /count: number/);
  assert.match(react, /history: Array<string>/);
  assert.doesNotMatch(react, /export type CartSnapshot = CartSnapshot;/);
  assert.match(react, /VooyaStoreOptions/);
  assert.match(react, /export declare function useCart\(options\?: VooyaStoreOptions\)/);
  assert.match(react, /state: CartSnapshot \| undefined/);
  assert.match(react, /add\(...args: \[number\]\): void/);

  const solid = generateRustStoreDeclaration(store, "solid", types);
  assert.match(solid, /import type \{ Accessor \} from "solid-js"/);
  assert.match(solid, /from "@vooya\/solid"/);
  assert.match(solid, /state: Accessor<CartSnapshot \| undefined>/);

  const svelte = generateRustStoreDeclaration(store, "svelte", types);
  assert.match(svelte, /import type \{ Readable \} from "svelte\/store"/);
  assert.match(svelte, /from "@vooya\/svelte"/);
  assert.match(svelte, /state: Readable<CartSnapshot \| undefined>/);
});

test("falls back safely for an unresolved store snapshot without losing known action types", () => {
  const store = {
    version: 1, kind: "store", id: "cart::Cart", name: "Cart", snapshot: "Option<CartSnapshot>",
    actions: [{ name: "add", params: [{ name: "amount", type: "u32" }, { name: "payload", type: "OpaquePayload" }] }],
  };
  const code = generateRustStoreDeclaration(store, "vue");
  assert.match(code, /export type CartSnapshot = unknown \| null/);
  assert.match(code, /add\(\.\.\.args: \[number, unknown\]\): void/);
  assert.doesNotMatch(code, /CartSnapshot = CartSnapshot/);
});

test("maps primitive store snapshots before checking named type schemas", () => {
  const store = { version: 1, kind: "store", id: "value::Value", name: "Value", snapshot: "String", actions: [] };
  const code = generateRustStoreDeclaration(store, "react");
  assert.match(code, /export type ValueSnapshot = string;/);
  assert.doesNotMatch(code, /ValueSnapshot = String/);
});

test("rejects a named action type that collides with the generated snapshot alias", () => {
  const store = {
    version: 1, kind: "store", id: "cart::Cart", name: "Cart", snapshot: "u32",
    actions: [{ name: "replace", params: [{ name: "value", type: "CartSnapshot" }] }],
  };
  const types = [{ version: 1, kind: "type", id: "CartSnapshot:from", name: "CartSnapshot", direction: "from", shape: {
    kind: "struct", fields: [{ name: "count", type: "u32" }],
  } }];
  assert.throws(() => generateRustStoreDeclaration(store, "vue", types), /conflicts with the generated snapshot alias/);
});
