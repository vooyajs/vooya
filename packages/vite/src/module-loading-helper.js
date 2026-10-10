import assert from "node:assert/strict";

export async function assertBindingsRetry(source, { runtimeSpecifier, exports, legacyFactory }) {
  const runtimeUrl = moduleUrl(`
    // Independent initialization state for ${runtimeSpecifier}.
    export const state = { loads: 0 };
    let complete, fail;
    export default function init() {
      state.loads++;
      return new Promise((resolve, reject) => { complete = resolve; fail = reject; });
    }
    export function resolveInitialization() { complete(); }
    export function rejectInitialization(error) { fail(error); }
    export function voo_abi_version() { return 1; }
    ${exports.map((name) => `export function ${name}() {}`).join("\n")}
  `);
  const adapterUrl = moduleUrl(legacyFactory
    ? `export function ${legacyFactory}(loadBindings) { return { loadBindings }; }`
    : "export function defineVooyaComponent(bridge) { return bridge; }");
  const generated = await import(moduleUrl(source
    .replace(JSON.stringify(runtimeSpecifier), JSON.stringify(runtimeUrl))
    .replace('"@vooya/vue"', JSON.stringify(adapterUrl))
    .replace('"@vooya/vite/runtime"', JSON.stringify(new URL("../dist/runtime.js", import.meta.url).href))));
  const runtime = await import(runtimeUrl);
  const load = generated.default.loadBindings;

  const failed = Promise.allSettled([load(), load()]);
  assert.equal(runtime.state.loads, 1, "concurrent mounts share one pending load");
  const cause = new Error("WASM request failed");
  runtime.rejectInitialization(cause);
  const failures = await failed;
  assert.deepEqual(failures.map((result) => result.status), ["rejected", "rejected"]);
  assert.ok(failures.every((result) => result.reason === cause));

  const retried = Promise.allSettled([load(), load()]);
  assert.equal(runtime.state.loads, 2, "the next mount retries the failed request once");
  runtime.resolveInitialization();
  const successes = await retried;
  assert.deepEqual(successes.map((result) => result.status), ["fulfilled", "fulfilled"]);
  assert.strictEqual(successes[0].value, successes[1].value, "successful bindings stay shared");
  assert.strictEqual(await load(), successes[0].value);
  assert.equal(runtime.state.loads, 2, "successful initialization is not repeated");
}

function moduleUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}
