import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { defineVooyaComponent, defineVooyaStore } from "../dist/index.js";

test("published React entry retains the Next/RSC client directive", () => {
  assert.match(readFileSync(new URL("../dist/index.js", import.meta.url), "utf8"), /^['"]use client['"];?/);
});

test("server render does not load WASM or create an instance-scoped Store", () => {
  assert.equal(typeof document, "undefined");
  let loads = 0;
  const Island = defineVooyaComponent({
    contract: { abiVersion: 1, name: "Counter", props: [], events: [], scopeId: "counter" },
    loadBindings() { loads++; throw new Error("server WASM load"); },
  });
  const useCounter = defineVooyaStore({
    name: "Counter", actions: [],
    create() { loads++; throw new Error("server Store creation"); },
  });
  function Page() {
    const { state } = useCounter();
    assert.equal(state, undefined);
    return createElement(Island, { className: "island" });
  }
  assert.equal(renderToString(createElement(Page)), renderToString(createElement(Page)));
  assert.match(renderToString(createElement(Page)), /data-vooya-host=""/);
  assert.equal(loads, 0);
});
