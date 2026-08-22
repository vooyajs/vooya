import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

test("useVooyaStore mirrors snapshots and disposes an owned instance", async () => {
  const dom = new JSDOM("<div id='app'></div>");
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.SVGElement = dom.window.SVGElement;
  const { createApp, defineComponent, h, nextTick } = await import("vue");
  const { useVooyaStore } = await import("../dist/index.js");

  let value = 0;
  let listener;
  let disposed = false;
  const store = {
    getSnapshot: () => value,
    subscribe(next) { listener = next; return () => { listener = undefined; }; },
    increment() { value += 1; listener?.(); },
    dispose() { disposed = true; },
  };
  let consumed;
  const app = createApp(defineComponent({
    setup() {
      consumed = useVooyaStore(store, { disposeOnUnmount: true });
      return () => h("span", String(consumed.snapshot.value));
    },
  }));
  app.mount(dom.window.document.querySelector("#app"));
  assert.equal(dom.window.document.querySelector("span").textContent, "0");
  consumed.dispatch("increment");
  await nextTick();
  assert.equal(dom.window.document.querySelector("span").textContent, "1");
  app.unmount();
  assert.equal(disposed, true);
  dom.window.close();
});

test("useVooyaStore disposes a store that resolves after unmount", async () => {
  const dom = new JSDOM("<div id='app'></div>");
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.SVGElement = dom.window.SVGElement;
  const { createApp, defineComponent, h, nextTick } = await import("vue");
  const { useVooyaStore } = await import("../dist/index.js");

  let resolveStore;
  let disposed = false;
  const source = new Promise((resolve) => { resolveStore = resolve; });
  const store = {
    getSnapshot: () => 1,
    subscribe: () => () => {},
    dispose: () => { disposed = true; },
  };
  const app = createApp(defineComponent({
    setup() {
      useVooyaStore(source, { disposeOnUnmount: true });
      return () => h("span", "pending");
    },
  }));
  app.mount(dom.window.document.querySelector("#app"));
  app.unmount();
  resolveStore(store);
  await nextTick();
  assert.equal(disposed, true);
  dom.window.close();
});
