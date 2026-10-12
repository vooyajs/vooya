import assert from "node:assert/strict";
import test from "node:test";

import { VOO_ABI_VERSION, assertVooAbiVersion, initializeWasm } from "../dist/runtime.js";

test("accepts the compiler ABI version", () => {
  assert.doesNotThrow(() => assertVooAbiVersion(VOO_ABI_VERSION));
});

test("reports mismatched WASM bindings before mount", () => {
  assert.throws(
    () => assertVooAbiVersion(VOO_ABI_VERSION + 1),
    /Vooya ABI mismatch: compiler expects 1, but WASM provides 2/,
  );
});

test("shares an in-flight WASM initialization across component modules", async () => {
  let calls = 0;
  let resolve;
  const initializer = () => {
    calls += 1;
    return new Promise((done) => {
      resolve = done;
    });
  };

  const first = initializeWasm(initializer);
  const second = initializeWasm(initializer);
  assert.equal(first, second);
  assert.equal(calls, 1);

  resolve("wasm exports");
  assert.equal(await first, "wasm exports");
  assert.equal(await initializeWasm(initializer), "wasm exports");
  assert.equal(calls, 1);
});

test("shares a failed initialization and retries after rejection", async () => {
  let calls = 0;
  let reject;
  let resolve;
  const initializer = () => {
    calls += 1;
    return new Promise((done, fail) => {
      reject = fail;
      resolve = done;
    });
  };

  const first = initializeWasm(initializer);
  const second = initializeWasm(initializer);
  assert.equal(first, second);
  assert.equal(calls, 1);

  const failure = new Error("WASM initialization failed");
  reject(failure);
  assert.equal(await first.catch((cause) => cause), failure);
  assert.equal(await second.catch((cause) => cause), failure);

  const retry = initializeWasm(initializer);
  const retryPair = initializeWasm(initializer);
  assert.equal(retry, retryPair);
  assert.equal(calls, 2);

  resolve("wasm exports after retry");
  assert.equal(await retry, "wasm exports after retry");
  assert.equal(await initializeWasm(initializer), "wasm exports after retry");
  assert.equal(calls, 2);
});

test("turns a synchronous initializer throw into a retryable rejection", async () => {
  let calls = 0;
  const failure = new Error("WASM initializer threw");
  const initializer = () => {
    calls += 1;
    if (calls === 1) throw failure;
    return "wasm exports after throw";
  };

  const first = initializeWasm(initializer);
  assert.equal(await first.catch((cause) => cause), failure);
  assert.equal(calls, 1);

  const second = initializeWasm(initializer);
  assert.equal(await second, "wasm exports after throw");
  assert.equal(await initializeWasm(initializer), "wasm exports after throw");
  assert.equal(calls, 2);
});

test("does not evict another initializer's successful result", async () => {
  let failedCalls = 0;
  let rejectFailed;
  const failedInitializer = () => {
    failedCalls += 1;
    return new Promise((resolve, reject) => {
      rejectFailed = reject;
    });
  };

  let successfulCalls = 0;
  const successfulInitializer = () => {
    successfulCalls += 1;
    return "cached WASM exports";
  };

  const successful = initializeWasm(successfulInitializer);
  assert.equal(await successful, "cached WASM exports");
  assert.equal(successfulCalls, 1);

  const failed = initializeWasm(failedInitializer);
  const failure = new Error("one initializer failed");
  rejectFailed(failure);
  assert.equal(await failed.catch((cause) => cause), failure);
  assert.equal(failedCalls, 1);

  assert.equal(await initializeWasm(successfulInitializer), "cached WASM exports");
  assert.equal(successfulCalls, 1);
});
