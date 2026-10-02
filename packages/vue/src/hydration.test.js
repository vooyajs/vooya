import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

test("hydrates the server host before loading isolated client stores", async () => {
  const dom = new JSDOM("<div id='app'></div>");
  for (const key of ["window", "document", "Node", "Element", "HTMLElement", "SVGElement"]) {
    globalThis[key] = key === "window" ? dom.window : dom.window[key];
  }
  const { createSSRApp, h, nextTick } = await import("vue");
  const { renderToString } = await import("vue/server-renderer");
  const { defineVooyaComponent, defineVooyaStore } = await import("../dist/index.js");
  let loads = 0, creates = 0, disposed = 0, unsubscribed = 0;
  const Island = defineVooyaComponent({
    contract: { abiVersion: 1, name: "Counter", props: [], events: [] },
    async loadBindings() {
      loads++;
      return { mount(host) { host.textContent = "WASM mounted"; return { dispose() { disposed++; } }; } };
    },
  });
  const useCounter = defineVooyaStore({
    name: "Counter", actions: ["add"],
    create() {
      creates++;
      let count = 0, notify;
      return {
        getSnapshot: () => count,
        subscribe(callback) { notify = callback; return () => { unsubscribed++; }; },
        add() { count++; notify?.(); },
        dispose() { disposed++; },
      };
    },
  });
  let counters;
  const Page = {
    setup() {
      counters = [useCounter(), useCounter()];
      return () => h("main", [h(Island), ...counters.map(({ state }) => h("span", state.value ?? "pending"))]);
    },
  };
  const container = dom.window.document.querySelector("#app");
  container.innerHTML = await renderToString(createSSRApp(Page));
  assert.equal(creates, 0);
  assert.equal(loads, 0);
  const host = container.querySelector("[data-vooya-host]");
  const warnings = [];
  const app = createSSRApp(Page);
  app.config.warnHandler = (message) => warnings.push(message);
  try {
    app.mount(container);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
    assert.equal(container.querySelector("[data-vooya-host]"), host);
    assert.equal(host.textContent, "WASM mounted");
    assert.equal(loads, 1);
    assert.equal(creates, 2);
    counters[0].add();
    await nextTick();
    assert.deepEqual([...container.querySelectorAll("span")].map((node) => node.textContent), ["1", "0"]);
    assert.deepEqual(warnings, []);
  } finally {
    app.unmount();
    dom.window.close();
  }
  assert.equal(disposed, 3);
  assert.equal(unsubscribed, 2);
});
