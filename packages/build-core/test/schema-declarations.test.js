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
  assert.match(code, /"checked-out": \(bigint\) => void/);
  assert.match(code, /DefineComponent/);
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
  assert.match(vue, /export declare function createCartStore\(\): Promise<Cart>;/);
  assert.match(vue, /export default createCartStore;/);
  assert.doesNotMatch(vue, /useCart/);

  const react = generateRustStoreDeclaration(store, "react");
  assert.match(react, /export type CartSnapshot = Record<string, unknown>;/);
  assert.doesNotMatch(react, /CartSnapshot = CartSnapshot/);
  assert.match(react, /VooyaStoreOptions/);
  assert.match(react, /export declare function useCart\(options\?: VooyaStoreOptions\)/);
  assert.match(react, /state: CartSnapshot \| undefined/);
  assert.match(react, /add\(...args: \[number\]\): void/);
});
