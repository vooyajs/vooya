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

test("shares a failed initialization rejection and allows a fresh attempt", async () => {
  let calls = 0;
  let rejectFirst;
  let resolveSecond;
  const failure = new Error("WASM initialization failed");
  const initializer = () => {
    calls += 1;
    if (calls === 1) {
      return new Promise((_, reject) => {
        rejectFirst = reject;
      });
    }
    return new Promise((resolve) => {
      resolveSecond = resolve;
    });
  };

  const first = initializeWasm(initializer);
  const second = initializeWasm(initializer);
  assert.equal(first, second);
  assert.equal(calls, 1);

  rejectFirst(failure);
  await Promise.all([
    assert.rejects(first, (cause) => cause === failure),
    assert.rejects(second, (cause) => cause === failure),
  ]);

  const retry = initializeWasm(initializer);
  const retryCaller = initializeWasm(initializer);
  assert.equal(retry, retryCaller);
  assert.notEqual(retry, first);
  assert.equal(calls, 2);

  resolveSecond("recovered exports");
  assert.equal(await retry, "recovered exports");
  assert.equal(await retryCaller, "recovered exports");
  const laterCaller = initializeWasm(initializer);
  assert.equal(laterCaller, retry);
  assert.equal(await laterCaller, "recovered exports");
  assert.equal(calls, 2);
});

test("a synchronous initializer throw rejects and a later attempt can succeed", async () => {
  let calls = 0;
  const failure = new Error("synchronous initialization failure");
  const initializer = () => {
    calls += 1;
    if (calls === 1) throw failure;
    return "recovered exports";
  };

  await assert.rejects(initializeWasm(initializer), (error) => error === failure);
  assert.equal(await initializeWasm(initializer), "recovered exports");
  assert.equal(await initializeWasm(initializer), "recovered exports");
  assert.equal(calls, 2);
});

test("a failed initializer does not evict another initializer's cached success", async () => {
  let rejectA;
  let callsA = 0;
  let callsB = 0;
  const failure = new Error("initializer A failed");
  const initializerA = () => {
    callsA += 1;
    return new Promise((_, reject) => {
      rejectA = reject;
    });
  };
  const initializerB = () => {
    callsB += 1;
    return "initializer B exports";
  };

  assert.equal(await initializeWasm(initializerB), "initializer B exports");
  const failedA = initializeWasm(initializerA);
  rejectA(failure);
  await assert.rejects(failedA, (error) => error === failure);

  assert.equal(await initializeWasm(initializerB), "initializer B exports");
  assert.equal(callsA, 1);
  assert.equal(callsB, 1);
});
