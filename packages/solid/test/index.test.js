import assert from "node:assert/strict";
import test from "node:test";
import { createRoot } from "solid-js";

import { useVooyaStore } from "../dist/index.js";

test("mirrors store snapshots and disposes with the Solid owner", async () => {
  let count = 0;
  let listener;
  let disposed = 0;
  let binding;
  let disposeOwner;

  createRoot((dispose) => {
    disposeOwner = dispose;
    binding = useVooyaStore(
      async () => ({
        getSnapshot: () => ({ count }),
        subscribe: (next) => {
          listener = next;
          return () => { listener = undefined; };
        },
        dispose: () => { disposed += 1; },
      }),
      undefined,
    );
  });

  await Promise.resolve();
  assert.deepEqual(binding.state(), { count: 0 });
  count = 2;
  listener();
  assert.deepEqual(binding.state(), { count: 2 });
  disposeOwner();
  assert.equal(listener, undefined);
  assert.equal(disposed, 1);
});

test("disposes a store that resolves after its owner is gone", async () => {
  let resolveStore;
  let disposed = 0;
  let disposeOwner;
  const pending = new Promise((resolve) => { resolveStore = resolve; });

  createRoot((dispose) => {
    disposeOwner = dispose;
    useVooyaStore(() => pending, undefined);
  });
  disposeOwner();
  resolveStore({
    getSnapshot: () => ({}),
    subscribe: () => undefined,
    dispose: () => { disposed += 1; },
  });
  await pending;
  await Promise.resolve();
  assert.equal(disposed, 1);
});

test("preserves a null snapshot before and after a Solid store action", async () => {
  let value = null;
  let listener;
  let binding;
  let disposeOwner;
  createRoot((dispose) => {
    disposeOwner = dispose;
    binding = useVooyaStore(async () => ({
      getSnapshot: () => value,
      subscribe(next) { listener = next; return () => { listener = undefined; }; },
      select(next) { value = next; listener?.(); },
      dispose() {},
    }), undefined);
  });
  try {
    assert.equal(binding.state(), undefined);
    await Promise.resolve();
    assert.equal(binding.state(), null);
    binding.store.select(7);
    assert.equal(binding.state(), 7);
    binding.store.select(null);
    assert.equal(binding.state(), null);
  } finally {
    disposeOwner();
  }
  assert.equal(listener, undefined);
});

for (const asynchronous of [false, true]) {
  test(`routes ${asynchronous ? "asynchronous" : "synchronous"} factory failures to onError`, async () => {
    const cause = new Error("store unavailable");
    const errors = [];
    let disposeOwner;
    try {
      createRoot((dispose) => {
        disposeOwner = dispose;
        useVooyaStore(() => {
          if (asynchronous) return Promise.reject(cause);
          throw cause;
        }, undefined, { onError: (error) => errors.push(error) });
      });
      await Promise.resolve();
      assert.deepEqual(errors, [cause]);
    } finally {
      disposeOwner?.();
    }
  });
}
