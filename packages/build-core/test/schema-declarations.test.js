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
  assert.match(code, /error: \(error: \{ stage: "load" | "mount" | "update" | "dispose"; cause: unknown \}\) => void/);
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
  assert.match(code, /onError\?: \(error: \{ stage: "load" | "mount" | "update" | "dispose"; cause: unknown \}\) => void/);
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

  const vue = generateRustStoreDeclaration(store, "vue");
  assert.match(vue, /VooyaStoreOptions/);
  assert.match(vue, /import type \{ Ref \} from "vue"/);
  assert.match(vue, /export declare function createCartStore\(\): Promise<CartStore>;/);
  assert.match(vue, /export default createCartStore;/);
  assert.match(vue, /export declare function useCart\(options\?: VooyaStoreOptions\)/);
  assert.match(vue, /state: Readonly<Ref<CartSnapshot \| undefined>>/);

  const react = generateRustStoreDeclaration(store, "react");
  assert.match(react, /export type CartSnapshot = Record<string, unknown>;/);
  assert.doesNotMatch(react, /CartSnapshot = CartSnapshot/);
  assert.match(react, /VooyaStoreOptions/);
  assert.match(react, /export declare function useCart\(options\?: VooyaStoreOptions\)/);
  assert.match(react, /state: CartSnapshot \| undefined/);
  assert.match(react, /add\(...args: \[number\]\): void/);

  const solid = generateRustStoreDeclaration(store, "solid");
  assert.match(solid, /import type \{ Accessor \} from "solid-js"/);
  assert.match(solid, /from "@vooya\/solid"/);
  assert.match(solid, /state: Accessor<CartSnapshot \| undefined>/);

  const svelte = generateRustStoreDeclaration(store, "svelte");
  assert.match(svelte, /import type \{ Readable \} from "svelte\/store"/);
  assert.match(svelte, /from "@vooya\/svelte"/);
  assert.match(svelte, /state: Readable<CartSnapshot \| undefined>/);
});
