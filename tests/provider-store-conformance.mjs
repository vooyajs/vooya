import assert from "node:assert/strict";
import test from "node:test";

/**
 * Internal fixture contract for provider Store canaries. It deliberately models
 * only the host-visible artifact boundary, not a compiler or language runtime.
 */
function defineProviderStoreFixture({ name, version, create, ...controls }) {
  if (typeof name !== "string" || !name) throw new Error("Provider fixture needs a name.");
  if (typeof version !== "string" || !version) throw new Error("Provider fixture needs a version.");
  if (typeof create !== "function") throw new Error("Provider fixture needs create(options).");
  return { name, version, create, ...controls };
}

function createReferenceFixture() {
  let failNext = false;
  return defineProviderStoreFixture({
    name: "rust-reference",
    version: "internal",
    create({ signal } = {}) {
      return new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(new Error("Store loading was cancelled."));
        const cancel = () => reject(new Error("Store loading was cancelled."));
        signal?.addEventListener("abort", cancel, { once: true });
        queueMicrotask(() => {
          signal?.removeEventListener("abort", cancel);
          if (signal?.aborted) return cancel();
          if (failNext) {
            failNext = false;
            reject(new Error("Store loading failed."));
            return;
          }
          resolve(createStore());
        });
      });
    },
    failNextLoad() { failNext = true; },
  });
}

function createStore() {
  let disposed = false;
  let count = 0;
  const listeners = new Set();
  const notify = () => { for (const listener of listeners) listener(); };
  return {
    getSnapshot() { return { count, label: `Count: ${count}` }; },
    subscribe(listener) {
      if (disposed) throw new Error("Store is disposed.");
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    add(delta) {
      if (!Number.isInteger(delta)) throw new Error("delta must be an integer.");
      if (disposed) throw new Error("Store is disposed.");
      count += delta;
      notify();
    },
    reset() {
      if (disposed) throw new Error("Store is disposed.");
      count = 0;
      notify();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      listeners.clear();
    },
  };
}

function providerConformance(name, createFixture) {
  test(`${name}: typed snapshots, actions, notifications and independent instances`, async () => {
    const fixture = createFixture();
    const first = await fixture.create();
    const second = await fixture.create();
    const snapshots = [];
    const unsubscribe = first.subscribe(() => snapshots.push(first.getSnapshot()));
    try {
      assert.deepEqual(first.getSnapshot(), { count: 0, label: "Count: 0" });
      first.add(2);
      first.reset();
      assert.deepEqual(snapshots, [{ count: 2, label: "Count: 2" }, { count: 0, label: "Count: 0" }]);
      assert.deepEqual(second.getSnapshot(), { count: 0, label: "Count: 0" });
      assert.throws(() => first.add(1.5), /integer/);
    } finally {
      unsubscribe();
      first.dispose();
      second.dispose();
    }
  });

  test(`${name}: cancellation, retry and idempotent disposal do not retain callbacks`, async () => {
    const fixture = createFixture();
    const controller = new AbortController();
    const cancelled = fixture.create({ signal: controller.signal });
    controller.abort();
    await assert.rejects(cancelled, /cancelled/);

    fixture.failNextLoad();
    await assert.rejects(fixture.create(), /failed/);
    const store = await fixture.create();
    let calls = 0;
    store.subscribe(() => { calls++; store.dispose(); });
    store.add(1);
    store.dispose();
    assert.equal(calls, 1);
    assert.throws(() => store.add(1), /disposed/);
  });
}

providerConformance("Rust reference Store fixture", createReferenceFixture);
