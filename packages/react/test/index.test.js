import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

import { defineVooyaComponent, useVooyaStore } from "../dist/index.js";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const greetingDefinition = {
  abiVersion: 1,
  name: "Greeting",
  props: [
    { name: "name", type: "string", required: false, defaultValue: "world" },
    { name: "count", type: "number", required: false, defaultValue: 42 },
    { name: "flag", type: "boolean", required: false, defaultValue: true },
  ],
  events: [],
};

test("mounts omitted props with their declared defaults", async () => {
  const { mountCalls, root } = await renderComponent(greetingDefinition, {});

  assert.deepEqual(mountCalls, [["world", 42, true]]);
  await act(async () => root.unmount());
});

test("passes explicit falsy props through instead of defaults", async () => {
  const { mountCalls, root } = await renderComponent(greetingDefinition, {
    name: "",
    count: 0,
    flag: false,
  });

  assert.deepEqual(mountCalls, [["", 0, false]]);
  await act(async () => root.unmount());
});

test("keeps omitted props without defaults undefined", async () => {
  const definition = {
    abiVersion: 1,
    name: "Required",
    props: [{ name: "label", type: "string", required: true }],
    events: [],
  };
  const { mountCalls, root } = await renderComponent(definition, {});

  assert.deepEqual(mountCalls, [[undefined]]);
  await act(async () => root.unmount());
});

test("re-applies a declared default when a prop is later removed", async () => {
  const { Component, mountCalls, updateCalls, root } = await renderComponent(
    greetingDefinition,
    { name: "Rust" },
  );

  await act(async () => {
    root.render(createElement(Component, {}));
  });

  assert.deepEqual(mountCalls, [["Rust", 42, true]]);
  assert.deepEqual(updateCalls, [{ name: "world" }]);
  await act(async () => root.unmount());
});

test("uses the atomic update entry point for changed props", async () => {
  const definition = {
    abiVersion: 1,
    name: "Atomic",
    props: [
      { name: "first", type: "string", required: true },
      { name: "second", type: "number", required: true },
    ],
    events: [],
  };
  const { Component, updates, root } = await renderComponentWithHandle(definition, {
    first: "a",
    second: 1,
  }, (values) => ({
    dispose() {},
    updateProps(values) {
      updates.push(values);
    },
    update_first() {
      throw new Error("per-property fallback should not be selected");
    },
  }));

  await act(async () => {
    root.render(createElement(Component, { first: "b", second: 2 }));
  });
  assert.deepEqual(updates, [{ first: "b", second: 2 }]);
  await act(async () => root.unmount());
});

test("reports update and dispose failures through the lifecycle error channel", async () => {
  const errors = [];
  const definition = {
    abiVersion: 1,
    name: "LifecycleErrors",
    props: [{ name: "value", type: "number", required: true }],
    events: [],
  };
  const Component = defineVooyaComponent(definition, async () => ({
    mount() {
      return {
        updateProps() {
          throw new Error("update failed");
        },
        dispose() {
          throw new Error("dispose failed");
        },
      };
    },
  }));
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(createElement(Component, {
    value: 1,
    onError(error) { errors.push(error); },
  })));
  await act(async () => root.render(createElement(Component, {
    value: 2,
    onError(error) { errors.push(error); },
  })));
  await act(async () => root.unmount());

  assert.deepEqual(errors.map((error) => error.stage), ["update", "dispose"]);
});

test("does not mount a binding that resolves after React unmounts", async () => {
  const definition = {
    abiVersion: 1,
    name: "Late",
    props: [],
    events: [],
  };
  let resolveBindings;
  let mountCount = 0;
  const Component = defineVooyaComponent(definition, () => new Promise((resolve) => {
    resolveBindings = resolve;
  }));
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(createElement(Component)));
  await act(async () => root.unmount());
  await act(async () => resolveBindings({
    mount() {
      mountCount += 1;
      return { dispose() {} };
    },
  }));
  assert.equal(mountCount, 0);
});

test("does not report a load failure after React unmounts", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  let rejectBindings;
  const errors = [];
  const Component = defineVooyaComponent(
    { abiVersion: 1, name: "LateError", props: [], events: [] },
    () => new Promise((resolve, reject) => {
      rejectBindings = reject;
    }),
  );
  const root = createRoot(container);
  await act(async () => root.render(createElement(Component, {
    onError(error) { errors.push(error); },
  })));
  await act(async () => root.unmount());
  await act(async () => rejectBindings(new Error("late failure")));
  assert.deepEqual(errors, []);
});

test("uses React's external-store contract and disposes the Rust store", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  let snapshot = { count: 1 };
  let notify;
  let disposed = 0;
  const factory = async () => ({
    getSnapshot() {
      return snapshot;
    },
    subscribe(listener) {
      notify = listener;
      return () => {
        notify = undefined;
      };
    },
    dispose() {
      disposed += 1;
    },
  });
  function StoreConsumer() {
    const { state } = useVooyaStore(factory, {});
    return createElement("span", null, state?.count ?? "loading");
  }
  const root = createRoot(container);
  await act(async () => root.render(createElement(StoreConsumer)));
  assert.equal(container.textContent, "1");

  snapshot = { count: 2 };
  await act(async () => notify());
  assert.equal(container.textContent, "2");

  await act(async () => root.unmount());
  assert.equal(disposed, 1);
  assert.equal(notify, undefined);
});

test("disposes an asynchronously created store after an early unmount", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  let resolveStore;
  let disposed = 0;
  const factory = () => new Promise((resolve) => {
    resolveStore = resolve;
  });
  function StoreConsumer() {
    useVooyaStore(factory, {});
    return null;
  }
  const root = createRoot(container);
  await act(async () => root.render(createElement(StoreConsumer)));
  await act(async () => root.unmount());
  await act(async () => resolveStore({
    getSnapshot() { return {}; },
    subscribe() {},
    dispose() { disposed += 1; },
  }));
  assert.equal(disposed, 1);
});

async function renderComponent(definition, props) {
  const container = document.createElement("div");
  document.body.append(container);
  const mountCalls = [];
  const updateCalls = [];
  let handle;
  let resolveBindings;

  const Component = defineVooyaComponent(
    definition,
    () =>
      new Promise((resolve) => {
        resolveBindings = resolve;
      }),
  );
  const root = createRoot(container);

  await act(async () => {
    root.render(createElement(Component, props));
  });
  await act(async () => {
    resolveBindings({
      mount(host, ...values) {
        mountCalls.push(values);
        handle = {
          dispose() {},
          ...Object.fromEntries(
            definition.props.map((prop) => [
              `update_${prop.name}`,
              (value) => updateCalls.push({ [prop.name]: value }),
            ]),
          ),
        };
        return handle;
      },
    });
  });

  return { Component, mountCalls, updateCalls, root };
}

async function renderComponentWithHandle(definition, props, createHandle) {
  const container = document.createElement("div");
  document.body.append(container);
  const updates = [];
  let handle;
  const Component = defineVooyaComponent(definition, async () => ({
    mount(host, ...values) {
      handle = createHandle(values);
      return handle;
    },
  }));
  const root = createRoot(container);
  await act(async () => root.render(createElement(Component, props)));
  return { Component, handle, updates, root };
}
