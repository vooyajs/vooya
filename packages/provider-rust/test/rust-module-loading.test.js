import assert from "node:assert/strict";
import test from "node:test";
import { renderRustComponentModule, renderRustStoreModule } from "../dist/rust-modules.js";

for (const kind of ["component", "store"]) {
  test(`generated Rust ${kind} retries failed WASM loading while sharing pending and successful bindings`, async () => {
    const runtimeUrl = moduleUrl(`
      // Independent initialization state for the ${kind} module.
      export const state = { loads: 0, created: 0 };
      let complete, fail;
      export default function init() {
        state.loads++;
        return new Promise((resolve, reject) => { complete = resolve; fail = reject; });
      }
      export function resolveInitialization() { complete(); }
      export function rejectInitialization(error) { fail(error); }
      export function voo_abi_version() { return 1; }
      export function voo_counter_mount() { return ++state.created; }
      export function voo_counter_update_props() {}
      export function voo_counter_dispose() {}
      export function voo_cart_store_create() { return ++state.created; }
      export function voo_cart_store_snapshot(handle) { return handle; }
      export function voo_cart_store_subscribe() { return 1; }
      export function voo_cart_store_unsubscribe() {}
      export function voo_cart_store_dispose() {}
    `);
    const helpersUrl = moduleUrl(`
      export function initializeWasm(init) { return init(); }
      export function assertVooAbiVersion(actual) {
        if (actual !== 1) throw new Error("ABI mismatch");
      }
    `);
    const adapterUrl = moduleUrl(`
      export function defineVooyaComponent(bridge) { return bridge; }
      export function defineVooyaStore(bridge) { return bridge; }
    `);
    const options = { runtimeModule: runtimeUrl, runtimeHelpers: helpersUrl };
    const source = kind === "component"
      ? renderRustComponentModule({ component: { name: "Counter", id: "Counter", params: [] } }, "vue", "Counter.rs", options)
      : renderRustStoreModule({ name: "Cart", actions: [], snapshot: "u32" }, "vue", options);
    const generated = await import(moduleUrl(source.replace('"@vooya/vue"', JSON.stringify(adapterUrl))));
    const runtime = await import(runtimeUrl);
    const load = kind === "component" ? generated.default.loadBindings : generated.createCartStore;

    const failed = Promise.allSettled([load(), load()]);
    assert.equal(runtime.state.loads, 1, "concurrent consumers share one pending load");
    const cause = new Error("WASM request failed");
    runtime.rejectInitialization(cause);
    const failures = await failed;
    assert.deepEqual(failures.map((result) => result.status), ["rejected", "rejected"]);
    assert.ok(failures.every((result) => result.reason === cause));
    assert.equal(runtime.state.created, 0, "failed initialization cannot create Rust instances");

    const first = load();
    const second = load();
    const retried = Promise.allSettled([first, second]);
    assert.equal(runtime.state.loads, 2, "the next mount retries the failed request once");
    runtime.resolveInitialization();
    const successes = await retried;
    assert.deepEqual(successes.map((result) => result.status), ["fulfilled", "fulfilled"]);
    const [left, right] = successes.map((result) => result.value);
    if (kind === "component") assert.strictEqual(left, right, "successful bindings stay shared");
    else assert.notEqual(left.getSnapshot(), right.getSnapshot(), "Store instances remain independent");

    await load();
    assert.equal(runtime.state.loads, 2, "successful initialization is not repeated");
  });
}

function moduleUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}
