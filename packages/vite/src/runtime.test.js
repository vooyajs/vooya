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
  const results = await Promise.allSettled([first, second]);
  assert.deepEqual(results, [
    { status: "rejected", reason: failure },
    { status: "rejected", reason: failure },
  ]);

  const retry = initializeWasm(initializer);
  const retryCaller = initializeWasm(initializer);
  assert.equal(retry, retryCaller);
  assert.equal(calls, 2);

  resolveSecond("recovered exports");
  assert.equal(await retry, "recovered exports");
  assert.equal(await retryCaller, "recovered exports");
  assert.equal(await initializeWasm(initializer), "recovered exports");
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

test("does not evict another initializer while it is still pending", async () => {
  let failedCalls = 0;
  let rejectFailed;
  const failedInitializer = () => {
    failedCalls += 1;
    return new Promise((_, reject) => {
      rejectFailed = reject;
    });
  };

  let successfulCalls = 0;
  let resolveSuccessful;
  const successfulInitializer = () => {
    successfulCalls += 1;
    return new Promise((resolve) => {
      resolveSuccessful = resolve;
    });
  };

  const successful = initializeWasm(successfulInitializer);
  const successfulPair = initializeWasm(successfulInitializer);
  assert.equal(successful, successfulPair);
  assert.equal(successfulCalls, 1);

  const failed = initializeWasm(failedInitializer);
  const failure = new Error("one initializer failed");
  rejectFailed(failure);
  await assert.rejects(failed, (cause) => cause === failure);
  assert.equal(failedCalls, 1);

  const afterFailure = initializeWasm(successfulInitializer);
  assert.equal(afterFailure, successful);
  assert.equal(successfulCalls, 1);

  resolveSuccessful("cached WASM exports");
  assert.deepEqual(await Promise.all([successful, successfulPair, afterFailure]), [
    "cached WASM exports",
    "cached WASM exports",
    "cached WASM exports",
  ]);
  assert.equal(initializeWasm(successfulInitializer), successful);
  assert.equal(successfulCalls, 1);
});
