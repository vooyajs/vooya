import assert from "node:assert/strict";
import test from "node:test";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { defineVooyaComponent, defineVooyaStore } from "../dist/index.js";

test("SSR renders a stable host without starting component or Store WASM", async () => {
  assert.equal(typeof document, "undefined");
  let loads = 0;
  const Island = defineVooyaComponent({
    contract: { abiVersion: 1, name: "Counter", props: [], events: [], scopeId: "counter" },
    loadBindings() { loads++; throw new Error("WASM must not load on the server"); },
  });
  const useStore = defineVooyaStore({
    name: "CounterStore", actions: ["add"],
    create() { loads++; throw new Error("Store must not be created on the server"); },
  });
  const page = () => createSSRApp({
    setup() {
      const { state } = useStore();
      assert.equal(state.value, undefined);
      return () => h(Island, { class: "island" });
    },
  });
  const html = await Promise.all([renderToString(page()), renderToString(page())]);
  assert.equal(html[0], html[1]);
  assert.match(html[0], / data-vooya-host(?:="")?(?=[ >])/);
  assert.match(html[0], /data-voo-scope="counter"/);
  assert.equal(loads, 0);
});
