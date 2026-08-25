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
