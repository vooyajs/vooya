import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { defineVooyaComponent, defineVooyaStore } from "../dist/index.js";

test("hydrates the existing host and loads independent client stores", async () => {
  const dom = new JSDOM("<div id='app'></div>");
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let loads = 0, creates = 0, disposed = 0, unsubscribed = 0, counters;
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
  function Page() {
    counters = [useCounter(), useCounter()];
    return createElement("main", null, createElement(Island), ...counters.map(({ state }, key) => createElement("span", { key }, state ?? "pending")));
  }
  const container = document.querySelector("#app");
  container.innerHTML = renderToString(createElement(Page));
  const host = container.querySelector("[data-vooya-host]");
  assert.equal(creates, 0);
  assert.equal(loads, 0);
  const errors = [];
  let root;
  try {
    await act(async () => { root = hydrateRoot(container, createElement(Page), { onRecoverableError: (error) => errors.push(error) }); });
    assert.equal(container.querySelector("[data-vooya-host]"), host);
    assert.equal(host.textContent, "WASM mounted");
    assert.equal(creates, 2);
    assert.equal(loads, 1);
    await act(async () => counters[0].add());
    assert.deepEqual([...container.querySelectorAll("span")].map((node) => node.textContent), ["1", "0"]);
    assert.deepEqual(errors, []);
  } finally {
    if (root) await act(async () => root.unmount());
    dom.window.close();
  }
  assert.equal(disposed, 3);
  assert.equal(unsubscribed, 2);
});
