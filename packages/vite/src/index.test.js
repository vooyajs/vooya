import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import test from "node:test";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import {
  createRustBuildProgress,
  generateRustComponentModule,
  generateRustStoreModule,
  generateRustVueModule,
  generateRustVueStoreModule,
  vooya,
} from "../dist/index.js";

test("reports stable Rust/WASM build stages with their elapsed duration", () => {
  const messages = [];
  let time = 100;
  const progress = createRustBuildProgress({ info(message) { messages.push(message); } }, () => time);

  progress.complete();
  progress.start();
  time = 142.4;
  progress.complete();
  progress.start();
  time = 200;
  progress.fail();

  assert.deepEqual(messages, [
    "Vooya: building Rust/WASM source…",
    "Vooya: Rust/WASM build complete in 42ms.",
    "Vooya: building Rust/WASM source…",
    "Vooya: Rust/WASM build failed after 58ms.",
  ]);
});

test("uses compiler output when generating a source component virtual module", () => {
  const root = mkdtempSync(resolve(tmpdir(), "vooya-plugin-"));
  const id = resolve(root, "Counter.voo");
  writeFileSync(id, `<component name="Counter">
props:
  initial: i32 = 0
events:
  change(value: i32)
</component>
<rust>pub struct Component;</rust>
<style scoped>.counter { color: red; }</style>`);
  try {
    const plugin = vooya();
    plugin.configResolved({ root });

    const output = plugin.load.call({}, id);
    assert.match(output, /voo_counter_mount/);
    assert.match(output, /scopeId/);
    assert.match(output, /"initial","type":"number","required":false,"defaultValue":0/);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("generates a Vue virtual module for a Rust-file component contract", () => {
  const output = generateRustVueModule({
    component: { version: 1, kind: "component", id: "cart::Cart", name: "Cart", group: "src/Cart.rs", params: [] },
    props: { version: 1, kind: "props", id: "cart::Props", name: "Props", group: "src/Cart.rs", fields: [{ name: "count", type: "u32" }] },
    events: { version: 1, kind: "events", id: "cart::Events", name: "Events", group: "src/Cart.rs", methods: [] },
  });
  assert.match(output, /voo_cart_mount/);
  assert.match(output, /voo_cart_update_props/);
  assert.match(output, /currentProps/);
  assert.match(output, /defineVooyaComponent/);
});

test("generates scoped Rust-file style imports from schema metadata", () => {
  const output = generateRustVueModule({
    component: {
      version: 1,
      kind: "component",
      id: "cart::Cart",
      name: "Cart",
      group: "/consumer/src/Cart.rs",
      params: [],
      styles: [{ path: "./Cart.css", scoped: true }],
    },
    props: undefined,
    events: undefined,
  });
  assert.match(output, /virtual:vooya-rust-style:/);
  assert.match(output, /scopeId/);
});

test("loads and scopes Rust-file CSS through the bundler hook", () => {
  const root = mkdtempSync(resolve(tmpdir(), "vooya-rust-style-"));
  const componentId = resolve(root, "Counter.rs");
  writeFileSync(resolve(root, "Counter.css"), ".counter { color: red; }");
  try {
    const plugin = vooya();
    const source = `virtual:vooya-rust-style:${encodeURIComponent(JSON.stringify({
      componentId,
      name: "Counter",
      styles: [{ path: "./Counter.css", scoped: true }],
    }))}.css`;
    const resolved = plugin.resolveId(source);
    const css = plugin.load(resolved);
    assert.match(css, /data-voo-scope/);
    assert.match(css, /color: red/);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("generates a Vue virtual module for an instance-scoped Rust store", () => {
  const output = generateRustVueStoreModule({
    version: 1,
    kind: "store",
    id: "cart::Cart",
    name: "Cart",
    group: "src/Cart.rs",
    snapshot: "CartSnapshot",
    actions: [{ name: "add", params: [{ name: "quantity", type: "u32" }] }],
  });
  assert.match(output, /voo_cart_store_create/);
  assert.match(output, /voo_cart_store_snapshot/);
  assert.match(output, /voo_cart_store_add/);
  assert.match(output, /createCartStore/);
  assert.match(output, /subscribe\(listener\)/);
});

test("generates React virtual modules from the same Rust contracts", () => {
  const component = generateRustComponentModule({
    component: { version: 1, kind: "component", id: "cart::Cart", name: "Cart", group: "src/Cart.rs", params: [] },
    props: { version: 1, kind: "props", id: "cart::Props", name: "Props", group: "src/Cart.rs", fields: [{ name: "count", type: "u32" }] },
    events: { version: 1, kind: "events", id: "cart::Events", name: "Events", group: "src/Cart.rs", methods: [] },
  }, "react");
  assert.match(component, /from "@vooya\/react"/);
  assert.doesNotMatch(component, /currently supports only/);
  assert.match(component, /updateProps\(values\)/);

  const store = generateRustStoreModule({
    version: 1,
    kind: "store",
    id: "cart::Cart",
    name: "Cart",
    group: "src/Cart.rs",
    snapshot: "CartSnapshot",
    actions: [{ name: "add", params: [{ name: "quantity", type: "u32" }] }],
  }, "react");
  assert.match(store, /from "@vooya\/react"/);
  assert.match(store, /useVooyaStore/);
  assert.match(store, /export function useCart/);
  assert.match(store, /useVooyaStore\(createCartStore, undefined, options\)/);
  assert.doesNotMatch(store, /function useCart\(props/);
  assert.match(store, /createCartStore/);
});
