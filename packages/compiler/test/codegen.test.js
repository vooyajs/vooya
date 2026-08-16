import assert from "node:assert/strict";
import test from "node:test";

import {
  generateRustComponents,
  generatedAdapterDefinition,
  generatedComponentBinding,
  generatedComponentPrelude,
  generatedScopeId,
} from "../dist/index.js";

const counter = {
  name: "Counter",
  props: [{ name: "initial", rustType: "i32", required: true }],
  events: [],
  rust: {
    content: "pub struct Component;\nimpl Component {\n    pub fn update_initial(&self, _: i32) {}\n    pub fn dispose(&mut self) {}\n}\npub fn mount(_: web_sys::Element, _: i32) -> Result<Component, wasm_bindgen::JsValue> { Ok(Component) }",
  },
};

test("generates a stable WASM component binding", () => {
  assert.deepEqual(generatedComponentBinding(counter), {
    exportName: "voo_counter_mount",
    disposeName: "voo_counter_dispose",
    updateNames: { initial: "voo_counter_update_initial" },
    propsName: "VooCounterProps",
    eventsName: "VooCounterEvents",
    contextName: "VooCounterContext",
  });

  const generated = generateRustComponents([counter]);
  assert.match(generated, /mod voo_counter_component/);
  assert.match(generated, /static VOO_COUNTER_HANDLES: std::cell::RefCell<Vec<Option<voo_counter_component::Component>>>/);
  assert.match(generated, /pub fn voo_counter_update_initial\(handle: u32, value: i32\)/);
  assert.match(generated, /pub struct VooCounterContext/);
  assert.match(generated, /pub fn voo_counter_mount\(/);
  assert.match(generated, /pub fn voo_counter_dispose\(handle: u32\)/);
  assert.match(generated, /voo_counter_component::mount\(context\)/);
  assert.match(generated, /let cleanup = vooya_core::MountCleanup::default\(\)/);
  assert.match(generated, /cleanup\.run\(\)/);
  assert.match(generated, /cleanup\.disarm\(\)/);
});

test("generates typed event dispatch and a component source prelude", () => {
  const component = {
    ...counter,
    events: [{ name: "change", parameters: [{ name: "value", rustType: "i32" }] }],
  };
  const generated = generateRustComponents([component]);

  assert.equal(generatedComponentPrelude(component), "use super::VooCounterContext as Context;\n");
  assert.match(generated, /pub fn change\(&self, value: i32\)/);
  assert.match(generated, /JsValue::from_f64\(value as f64\)/);
  assert.match(generated, /new_with_event_init_dict\("vooya-change"/);
  assert.match(generated, /init\.set_bubbles\(false\)/);
  assert.doesNotMatch(generated, /init\.set_bubbles\(true\)/);
});

test("references extracted Rust sources for compiler diagnostics", () => {
  const component = { ...counter, id: "/app/Counter.voo" };
  const generated = generateRustComponents(
    [component],
    new Map([[component.id, "/build/Counter.rs"]]),
  );

  assert.match(generated, /#\[path = "\/build\/Counter.rs"\]/);
  assert.doesNotMatch(generated, /pub struct Component;/);
});

test("emits an empty generated module when an app has no source components", () => {
  const generated = generateRustComponents([]);
  assert.match(generated, /pub fn voo_abi_version\(\) -> u32/);
  assert.match(generated, /\n    1\n/);
  assert.doesNotMatch(generated, /pub fn voo_.*_mount/);
});

test("generates a serializable framework contract", () => {
  assert.deepEqual(
    generatedAdapterDefinition({
      ...counter,
      props: [
        { name: "initial", rustType: "i32", required: false, defaultValue: "2" },
        { name: "label", rustType: "String", required: false, defaultValue: '"Count"' },
      ],
      events: [{ name: "change", parameters: [{ name: "value", rustType: "i32" }] }],
    }),
    {
      abiVersion: 1,
      name: "Counter",
      props: [
        { name: "initial", type: "number", required: false, defaultValue: 2 },
        { name: "label", type: "string", required: false, defaultValue: "Count" },
      ],
      events: [{ name: "change", parameters: ["value"] }],
    },
  );
});

test("rejects prop types that cannot cross the generated ABI", () => {
  assert.throws(
    () =>
      generatedAdapterDefinition({
        ...counter,
        props: [{ name: "items", rustType: "Vec<String>", required: true }],
        events: [],
      }),
    /Unsupported Voo prop type/,
  );
});

test("rejects unstable 64-bit and 128-bit public integer ABI types before code generation", () => {
  for (const rustType of ["i64", "u64", "i128", "u128"]) {
    assert.throws(
      () =>
        generatedAdapterDefinition({
          ...counter,
          props: [{ name: "value", rustType, required: false, defaultValue: "7" }],
        }),
      new RegExp(`Unsupported Voo public ABI type "${rustType}" for prop "value"`),
    );
    assert.throws(
      () =>
        generateRustComponents([
          {
            ...counter,
            props: [],
            events: [{ name: "change", parameters: [{ name: "value", rustType }] }],
          },
        ]),
      new RegExp(`Unsupported Voo public ABI type "${rustType}" for event "change" parameter "value"`),
    );
  }
});

test("rejects borrowed string types in adapter definition and Rust code generation", () => {
  for (const rustType of ["str", "&str", "&'static str"]) {
    assert.throws(
      () =>
        generatedAdapterDefinition({
          ...counter,
          props: [{ name: "label", rustType, required: true }],
          events: [],
        }),
      new RegExp(`Unsupported Voo public ABI type "${rustType}" for prop "label"\\. Use owned String\\.`),
    );
    assert.throws(
      () =>
        generatedAdapterDefinition({
          ...counter,
          props: [],
          events: [{ name: "changed", parameters: [{ name: "value", rustType }] }],
        }),
      new RegExp(`Unsupported Voo public ABI type "${rustType}" for event "changed" parameter "value"\\. Use owned String\\.`),
    );
    assert.throws(
      () =>
        generateRustComponents([
          {
            ...counter,
            props: [{ name: "label", rustType, required: true }],
            events: [],
          },
        ]),
      new RegExp(`Unsupported Voo public ABI type "${rustType}" for prop "label"\\. Use owned String\\.`),
    );
    assert.throws(
      () =>
        generateRustComponents([
          {
            ...counter,
            props: [],
            events: [{ name: "changed", parameters: [{ name: "value", rustType }] }],
          },
        ]),
      new RegExp(`Unsupported Voo public ABI type "${rustType}" for event "changed" parameter "value"\\. Use owned String\\.`),
    );
  }
});

test("generates Rust component bindings for owned String props and events", () => {
  const component = {
    ...counter,
    props: [{ name: "label", rustType: "String", required: true }],
    events: [{ name: "changed", parameters: [{ name: "value", rustType: "String" }] }],
  };
  const generated = generateRustComponents([component]);

  assert.match(generated, /pub label: String,/);
  assert.match(generated, /pub fn voo_counter_update_label\(handle: u32, value: String\)/);
  assert.match(generated, /pub fn changed\(&self, value: String\)/);
  assert.match(generated, /JsValue::from_str\(&value\)/);
});


test("generates a stable style scope from the component path", () => {
  const component = {
    ...counter,
    id: "/app/Counter.voo",
    style: { content: ".counter {}", scoped: true },
    events: [],
  };
  const definition = generatedAdapterDefinition(component);

  assert.equal(definition.scopeId, generatedScopeId(component));
  assert.match(definition.scopeId, /^voo-[a-f0-9]+$/);
  assert.notEqual(generatedScopeId(component), generatedScopeId({ ...component, id: "/other.voo" }));
});
