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

test("shares a failing in-flight WASM initialization across callers and runs once", async () => {
  let calls = 0;
  let reject;
  const failure = new Error("shared init failure");
  const initializer = () => {
    calls += 1;
    return new Promise((_, fail) => {
      reject = fail;
    });
  };

  const first = initializeWasm(initializer);
  const second = initializeWasm(initializer);
  assert.equal(first, second);
  assert.equal(calls, 1);

  reject(failure);

  await assert.rejects(first, (cause) => {
    assert.equal(cause, failure);
    return true;
  });
  await assert.rejects(second, (cause) => {
    assert.equal(cause, failure);
    return true;
  });
  assert.equal(calls, 1);
});

test("after rejection, the next pair shares a fresh attempt and subsequent calls reuse the success", async () => {
  let calls = 0;
  let failFirst;
  let resolveSecond;
  const failure = new Error("first attempt failure");
  const initializer = () => {
    calls += 1;
    if (calls === 1) {
      return new Promise((_, fail) => {
        failFirst = fail;
      });
    }
    return new Promise((done) => {
      resolveSecond = done;
    });
  };

  const failCaller1 = initializeWasm(initializer);
  const failCaller2 = initializeWasm(initializer);
  assert.equal(failCaller1, failCaller2);
  assert.equal(calls, 1);

  failFirst(failure);
  await assert.rejects(failCaller1, (cause) => {
    assert.equal(cause, failure);
    return true;
  });
  await assert.rejects(failCaller2, (cause) => {
    assert.equal(cause, failure);
    return true;
  });

  const retryCaller1 = initializeWasm(initializer);
  const retryCaller2 = initializeWasm(initializer);
  assert.equal(retryCaller1, retryCaller2);
  assert.notEqual(retryCaller1, failCaller1);
  assert.equal(calls, 2);

  resolveSecond("recovered wasm");
  assert.equal(await retryCaller1, "recovered wasm");
  assert.equal(await retryCaller2, "recovered wasm");

  const laterCaller = initializeWasm(initializer);
  assert.equal(laterCaller, retryCaller1);
  assert.equal(await laterCaller, "recovered wasm");
  assert.equal(calls, 2);
});

test("synchronous throw rejects the returned promise and does not prevent a later successful attempt", async () => {
  let calls = 0;
  const failure = new Error("sync failure");
  const initializer = () => {
    calls += 1;
    if (calls === 1) throw failure;
    return "recovered sync";
  };

  const failingCall = initializeWasm(initializer);
  await assert.rejects(failingCall, (cause) => {
    assert.equal(cause, failure);
    return true;
  });
  assert.equal(calls, 1);

  const succeedingCall = initializeWasm(initializer);
  assert.equal(await succeedingCall, "recovered sync");
  assert.equal(calls, 2);

  const laterCall = initializeWasm(initializer);
  assert.equal(await laterCall, "recovered sync");
  assert.equal(calls, 2);
});

test("failure of initializer A does not evict the successful cached result for initializer B", async () => {
  let bCalls = 0;
  const initializerB = () => {
    bCalls += 1;
    return Promise.resolve("exports B");
  };

  assert.equal(await initializeWasm(initializerB), "exports B");
  assert.equal(bCalls, 1);

  let aCalls = 0;
  const failureA = new Error("initializer A failed");
  const initializerA = () => {
    aCalls += 1;
    return Promise.reject(failureA);
  };

  await assert.rejects(initializeWasm(initializerA), (cause) => {
    assert.equal(cause, failureA);
    return true;
  });
  assert.equal(aCalls, 1);

  assert.equal(await initializeWasm(initializerB), "exports B");
  assert.equal(bCalls, 1);
});

