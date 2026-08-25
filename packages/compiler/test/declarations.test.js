import assert from "node:assert/strict";
import test from "node:test";

import { generateVooDeclaration } from "../dist/index.js";

test("generates Vue props and event declarations from a component contract", () => {
  const declaration = generateVooDeclaration(
    {
      name: "Counter",
      props: [
        { name: "initial", rustType: "i32", required: true },
        { name: "label", rustType: "String", required: false },
      ],
      events: [
        { name: "change", parameters: [{ name: "value", rustType: "i32" }] },
        { name: "reset-all", parameters: [] },
      ],
    },
    "vue",
  );

  assert.match(declaration, /initial: number;/);
  assert.match(declaration, /label\?: string;/);
  assert.match(declaration, /change: \(value: number\) => void;/);
  assert.match(declaration, /"reset-all": \(\) => void;/);
  assert.match(declaration, /preserving these literal event names keeps \$emit type-safe/);
  assert.match(declaration, /DefineComponent</);
});

test("uses Vue's string-array emit form when a component has no custom events", () => {
  const declaration = generateVooDeclaration(
    { name: "StaticCanvas", props: [], events: [] },
    "vue",
  );

  assert.match(declaration, /type StaticCanvasEvents = \["error"\];/);
  assert.doesNotMatch(declaration, /@ts-expect-error/);
});

test("generates React callback props from component events", () => {
  const declaration = generateVooDeclaration(
    {
      name: "Counter",
      props: [
        { name: "initial", rustType: "i32", required: true },
        { name: "label", rustType: "String", required: false },
      ],
      events: [
        { name: "change", parameters: [{ name: "value", rustType: "i32" }] },
        { name: "reset-all", parameters: [] },
      ],
    },
    "react",
  );

  assert.match(declaration, /initial: number;/);
  assert.match(declaration, /label\?: string;/);
  assert.match(declaration, /onChange\?: \(value: number\) => void;/);
  assert.match(declaration, /onResetAll\?: \(\) => void;/);
  assert.match(declaration, /ComponentType<CounterProps>/);
});

test("generates Solid component declarations with idiomatic callback props", () => {
  const declaration = generateVooDeclaration(
    {
      name: "Counter",
      props: [{ name: "initial", rustType: "i32", required: true }],
      events: [{ name: "selected", parameters: [{ name: "value", rustType: "i32" }] }],
    },
    "solid",
  );

  assert.match(declaration, /import type \{ Component \} from "solid-js"/);
  assert.match(declaration, /onSelected\?: \(value: number\) => void/);
  assert.match(declaration, /class\?: string/);
  assert.match(declaration, /Component<CounterProps>/);
});

test("generates Svelte component declarations with callback props", () => {
  const declaration = generateVooDeclaration(
    {
      name: "Counter",
      props: [{ name: "initial", rustType: "i32", required: true }],
      events: [{ name: "selected", parameters: [{ name: "value", rustType: "i32" }] }],
    },
    "svelte",
  );

  assert.match(declaration, /import type \{ Component \} from "svelte"/);
  assert.match(declaration, /onSelected\?: \(value: number\) => void/);
  assert.match(declaration, /Component<CounterProps>/);
});

test("rejects borrowed string types in framework declaration generation", () => {
  for (const framework of ["vue", "react", "solid", "svelte"]) {
    for (const rustType of ["str", "&str", "&'static str"]) {
      assert.throws(
        () =>
          generateVooDeclaration(
            {
              name: "BorrowedProps",
              props: [{ name: "label", rustType, required: true }],
              events: [],
            },
            framework,
          ),
        new RegExp(`Unsupported Voo public ABI type "${rustType}" for prop "label"\\. Use owned String\\.`),
      );
      assert.throws(
        () =>
          generateVooDeclaration(
            {
              name: "BorrowedEvents",
              props: [],
              events: [{ name: "changed", parameters: [{ name: "value", rustType }] }],
            },
            framework,
          ),
        new RegExp(`Unsupported Voo public ABI type "${rustType}" for event "changed" parameter "value"\\. Use owned String\\.`),
      );
    }
  }
});
