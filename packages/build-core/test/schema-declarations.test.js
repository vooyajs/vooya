import assert from "node:assert/strict";
import test from "node:test";

import { generateRustSchemaDeclaration, rustTypeToRuntimeType, rustTypeToTypeScript } from "../dist/schema-declarations.js";

test("maps ABI v1 Rust types to TypeScript without losing bigint precision", () => {
  assert.equal(rustTypeToTypeScript("u32"), "number");
  assert.equal(rustTypeToTypeScript("u128"), "bigint");
  assert.equal(rustTypeToTypeScript("Option<Vec<String>>"), "Array<string> | null");
  assert.equal(rustTypeToTypeScript("(u32, Option<String>)"), "[number, string | null]");
  assert.equal(rustTypeToTypeScript("HashMap<String, u64>"), "Record<string, bigint>");
  assert.throws(() => rustTypeToTypeScript("HashMap<u32, String>"), /Unsupported map key type/);
  assert.equal(rustTypeToRuntimeType("i128"), "bigint");
  assert.equal(rustTypeToRuntimeType("Option<Vec<String>>"), "array");
  assert.equal(rustTypeToRuntimeType("(u32, bool)"), "array");
  assert.equal(rustTypeToRuntimeType("HashMap<String, u32>"), "object");
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
