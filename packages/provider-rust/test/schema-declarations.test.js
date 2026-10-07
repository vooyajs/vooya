import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

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
  const directory = mkdtempSync(resolve(import.meta.dirname, ".named-types-"));
  try {
    for (const framework of ["vue", "react", "solid", "svelte"]) {
      const code = generateRustSchemaDeclaration({ framework, contract, types });
      writeFileSync(resolve(directory, `${framework}.d.ts`), code);
      const props = framework === "vue"
        ? "InstanceType<typeof Cart>['$props']"
        : "ComponentProps<typeof Cart>";
      const frameworkPackage = framework === "solid" ? "solid-js" : framework;
      const consumer = resolve(directory, `${framework}-consumer.ts`);
      writeFileSync(consumer, `
import Cart, { type Selection, type Limit } from "./${framework}.js";
${framework === "vue" ? "" : `import type { ComponentProps } from "${frameworkPackage}";`}
const selection: Selection = { id: 1, tags: ["selected"] };
const limit: Limit = { type: "Reached" };
const props: ${props} = { selection, onChanged: (value: Limit) => {} };
// @ts-expect-error Rust integer fields must reject strings.
const invalid: Selection = { id: "wrong", tags: [] };
// @ts-expect-error Component props must preserve the named field type.
const invalidProps: ${props} = { selection: { id: "wrong", tags: [] } };
`);
      const program = ts.createProgram([consumer], {
        noEmit: true,
        strict: true,
        skipLibCheck: false,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        types: [],
      });
      const diagnostics = ts.getPreEmitDiagnostics(program);
      assert.equal(diagnostics.length, 0, `${framework}: ${ts.formatDiagnostics(diagnostics, {
        getCanonicalFileName: (file) => file,
        getCurrentDirectory: () => directory,
        getNewLine: () => "\n",
      })}`);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
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
  }), /Candidates are: models:Selection:from \(src\/models\.rs\), filters:Selection:from \(src\/filters\.rs\)/);
});

test("resolves same-named types in the owning component source group", () => {
  const types = [
    { version: 1, kind: "type", id: "models:Selection:from", name: "Selection", group: "src/models.rs", direction: "from", shape: { kind: "struct", fields: [{ name: "id", type: "i32" }] } },
    { version: 1, kind: "type", id: "filters:Selection:from", name: "Selection", group: "src/filters.rs", direction: "from", shape: { kind: "struct", fields: [{ name: "query", type: "String" }] } },
  ];
  const models = generateRustSchemaDeclaration({
    framework: "vue",
    contract: {
      component: { version: 1, kind: "component", id: "models::Picker", name: "Picker", group: "src/models.rs", params: [] },
      props: { version: 1, kind: "props", id: "models::PickerProps", name: "PickerProps", group: "src/models.rs", fields: [{ name: "selection", type: "Selection" }] },
    },
    types,
  });
  const filters = generateRustSchemaDeclaration({
    framework: "react",
    contract: {
      component: { version: 1, kind: "component", id: "filters::Picker", name: "Picker", group: "src/filters.rs", params: [] },
      props: { version: 1, kind: "props", id: "filters::PickerProps", name: "PickerProps", group: "src/filters.rs", fields: [{ name: "selection", type: "Selection" }] },
    },
    types,
  });
  assert.match(models, /export interface Selection \{\n  id: number;/);
  assert.doesNotMatch(models, /query: string/);
  assert.match(filters, /export interface Selection \{\n  query: string;/);
  assert.doesNotMatch(filters, /id: number/);
});

test("resolves a qualified Rust type reference outside the component source group", () => {
  const code = generateRustSchemaDeclaration({
    framework: "vue",
    contract: {
      component: { version: 1, kind: "component", id: "ui::Picker", name: "Picker", group: "src/ui.rs", params: [] },
      props: { version: 1, kind: "props", id: "ui::PickerProps", name: "PickerProps", group: "src/ui.rs", fields: [{ name: "selection", type: "models::Selection" }] },
    },
    types: [
      { version: 1, kind: "type", id: "models:Selection:from", name: "Selection", group: "D:/project/src/models.rs", direction: "from", shape: { kind: "struct", fields: [{ name: "id", type: "i32" }] } },
      { version: 1, kind: "type", id: "filters:Selection:from", name: "Selection", group: "src/filters.rs", direction: "from", shape: { kind: "struct", fields: [{ name: "query", type: "String" }] } },
    ],
  });
  assert.match(code, /export interface Selection \{\n  id: number;/);
  assert.doesNotMatch(code, /query: string/);
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

test("renames both qualified types and preserves scoped references in every framework", () => {
  const types = [
    { version: 1, kind: "type", id: "models:Selection:from", name: "Selection", group: "src/models.rs", direction: "from", shape: { kind: "struct", fields: [{ name: "id", type: "u32" }] } },
    { version: 1, kind: "type", id: "filters:Selection:from", name: "Selection", group: "src/filters.rs", direction: "from", shape: { kind: "struct", fields: [{ name: "query", type: "String" }] } },
    { version: 1, kind: "type", id: "models:Envelope:to", name: "Envelope", group: "src/models.rs", direction: "to", shape: { kind: "struct", fields: [{ name: "items", type: "Vec<Selection>" }] } },
  ];
  const contract = {
    component: { version: 1, kind: "component", id: "ui::Picker", name: "Picker", group: "src/ui.rs", params: [] },
    props: { version: 1, kind: "props", id: "ui::Props", name: "Props", group: "src/ui.rs", fields: [
      { name: "model", type: "models::Selection" },
      { name: "filter", type: "filters::Selection" },
      { name: "envelope", type: "models::Envelope" },
      { name: "opaque", type: "Option<opaque::Selection>" },
    ] },
    events: { version: 1, kind: "events", id: "filters::Events", name: "Events", group: "src/filters.rs", methods: [
      { name: "changed", params: [{ name: "value", type: "Selection" }] },
    ] },
  };
  const directory = mkdtempSync(resolve(import.meta.dirname, ".scoped-types-"));
  try {
    for (const framework of ["vue", "react", "solid", "svelte"]) {
      const code = generateRustSchemaDeclaration({ framework, contract, types });
      assert.equal(code, generateRustSchemaDeclaration({ framework, contract, types: [...types].reverse() }));
      assert.match(code, /items: Array<ModelsSelection>/);
      assert.match(code, /value: FiltersSelection/);
      assert.match(code, /opaque\?: unknown \| null/);
      assert.doesNotMatch(code, /export interface Selection\b/);
      writeFileSync(resolve(directory, `${framework}.d.ts`), code);
      const consumer = resolve(directory, `${framework}-consumer.ts`);
      const props = framework === "vue" ? "InstanceType<typeof Picker>['$props']" : "ComponentProps<typeof Picker>";
      writeFileSync(consumer, `
import Picker, { type ModelsSelection, type FiltersSelection, type Envelope } from "./${framework}.js";
${framework === "vue" ? "" : `import type { ComponentProps } from "${framework === "solid" ? "solid-js" : framework}";`}
const model: ModelsSelection = { id: 1 };
const filter: FiltersSelection = { query: "active" };
const envelope: Envelope = { items: [model] };
const props: ${props} = { model, filter, envelope, onChanged: (value: FiltersSelection) => {} };
// @ts-expect-error Same short Rust name does not imply the same type.
const wrongModel: ModelsSelection = filter;
// @ts-expect-error Nested references must retain the models scope.
const wrongEnvelope: Envelope = { items: [filter] };
// @ts-expect-error Props must use the resolved alias, not the other Selection.
const wrongProps: ${props} = { model: filter, filter, envelope };
`);
      const program = ts.createProgram([consumer], {
        noEmit: true, strict: true, skipLibCheck: false,
        target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler, types: [],
      });
      const diagnostics = ts.getPreEmitDiagnostics(program);
      assert.equal(diagnostics.length, 0, ts.formatDiagnostics(diagnostics, {
        getCanonicalFileName: (file) => file, getCurrentDirectory: () => directory, getNewLine: () => "\n",
      }));
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  const store = { version: 1, kind: "store", id: "ui::Picker", name: "Picker", group: "src/ui.rs", snapshot: "models::Envelope", actions: [
    { name: "filter", params: [{ name: "value", type: "filters::Selection" }] },
  ] };
  const code = generateRustStoreDeclaration(store, "vue", types);
  assert.match(code, /items: Array<ModelsSelection>/);
  assert.match(code, /filter\(\.\.\.args: \[FiltersSelection\]\): void/);
  assert.match(code, /export type PickerSnapshot = Envelope/);
});

test("resolves crate, self and super references in conventional source layouts", () => {
  for (const [group, reference, target] of [
    ["src/ui.rs", "crate::models::Selection", "src/models.rs"],
    ["src/ui.rs", "super::models::Selection", "src/models.rs"],
    ["src/models/mod.rs", "self::Selection", "src/models/mod.rs"],
    ["D:\\project\\src\\ui.rs", "crate::models::Selection", "D:\\project\\src\\models.rs"],
    ["src/lib.rs", "crate::Selection", "src/lib.rs"],
  ]) {
    const store = { version: 1, kind: "store", id: "Store", name: "Store", group, snapshot: reference, actions: [] };
    const types = [{ version: 1, kind: "type", id: "Selection:to", name: "Selection", group: target, direction: "to", shape: { kind: "struct", fields: [{ name: "id", type: "u32" }] } }];
    assert.match(generateRustStoreDeclaration(store, "vue", types), /export type StoreSnapshot = Selection;/, reference);
  }
});

test("rejects unsupported reachable Store snapshot fields with source context in every adapter", () => {
  const store = { version: 1, kind: "store", id: "WorkflowReplay", name: "WorkflowReplay", group: "src/WorkflowReplay.rs", snapshot: "ReplaySnapshot", actions: [] };
  const source = { file: "src/WorkflowReplay.rs", line: 6, column: 16 };
  const types = [{ version: 1, kind: "type", id: "ReplaySnapshot:to", name: "ReplaySnapshot", group: store.group, direction: "to", shape: { kind: "struct", fields: [
    { name: "stage", type: "String" }, { name: "history", type: "&'static str", source },
  ] } }];
  for (const framework of ["vue", "react", "solid", "svelte"]) {
    assert.throws(() => generateRustStoreDeclaration(store, framework, types), error => {
      assert.equal(error.kind, "snapshot-schema");
      assert.deepEqual(error.source, source);
      assert.match(error.message, /src\/WorkflowReplay.rs:6:16.*ReplaySnapshot.history.*Unsupported Rust schema type/);
      return true;
    });
  }
  delete types[0].shape.fields[1].source;
  assert.throws(() => generateRustStoreDeclaration(store, "vue", types), error => {
    assert.deepEqual(error.source, { file: store.group });
    assert.doesNotMatch(error.message, /WorkflowReplay.rs:\d/);
    return true;
  });
});

test("checks snapshot reachability, rejects cycles and keeps unresolved metadata explicitly unknown", () => {
  const store = { version: 1, kind: "store", id: "Replay", name: "Replay", snapshot: "State", actions: [] };
  const state = { version: 1, kind: "type", id: "State:to", name: "State", direction: "to", shape: { kind: "struct", fields: [{ name: "children", type: "Vec<State>" }] } };
  assert.throws(() => generateRustStoreDeclaration(store, "react", [state]), /State.children.*Recursive Rust schema/);
  state.shape.fields = [{ name: "stage", type: "String" }];
  const unrelated = { ...state, id: "Other:to", name: "Other", shape: { kind: "struct", fields: [{ name: "borrowed", type: "&str" }] } };
  assert.match(generateRustStoreDeclaration(store, "react", [state, unrelated]), /stage: string/);
  const opaque = generateRustStoreDeclaration({ ...store, snapshot: "Option<Opaque>" }, "vue");
  assert.match(opaque, /ReplaySnapshot = unknown \| null/);
  assert.match(opaque, /Snapshot schema metadata is missing/);
  assert.doesNotMatch(generateRustStoreDeclaration(store, "vue", [state]), /Snapshot schema metadata is missing/);
});

test("nested snapshot failures identify the reachable field's own source", () => {
  const store = { version: 1, kind: "store", id: "Replay", name: "Replay", group: "src/store.rs", snapshot: "State", actions: [] };
  const types = [
    { version: 1, kind: "type", id: "State", name: "State", group: store.group, direction: "to", shape: { kind: "struct", fields: [{ name: "details", type: "details::Detail" }] } },
    { version: 1, kind: "type", id: "Detail", name: "Detail", group: "src/details.rs", direction: "to", shape: { kind: "struct", fields: [{ name: "borrowed", type: "&str", source: { file: "src/details.rs", line: 8, column: 19 } }] } },
  ];
  assert.throws(() => generateRustStoreDeclaration(store, "vue", types), /src\/details.rs:8:19.*State.details.borrowed/);
});
