import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import test from "node:test";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { createRustBuildProgress, vooya } from "../dist/index.js";

test("reports stable Rust/WASM build stages with their elapsed duration", () => {
  const messages = [];
  let time = 100;
  const progress = createRustBuildProgress({ info(message) { messages.push(message); } }, () => time);

  progress.complete();
  progress.start();
  time = 142.4;
  progress.complete();
  progress.start();
  time = 200;
  progress.fail();

  assert.deepEqual(messages, [
    "Vooya: building Rust/WASM source…",
    "Vooya: Rust/WASM build complete in 42ms.",
    "Vooya: building Rust/WASM source…",
    "Vooya: Rust/WASM build failed after 58ms.",
  ]);
});

test("uses compiler output when generating a source component virtual module", () => {
  const root = mkdtempSync(resolve(tmpdir(), "vooya-plugin-"));
  const id = resolve(root, "Counter.voo");
  writeFileSync(id, `<component name="Counter">
props:
  initial: i32 = 0
events:
  change(value: i32)
</component>
<rust>pub struct Component;</rust>
<style scoped>.counter { color: red; }</style>`);
  try {
    const plugin = vooya();
    plugin.configResolved({ root });

    const output = plugin.load.call({}, id);
    assert.match(output, /voo_counter_mount/);
    assert.match(output, /scopeId/);
    assert.match(output, /"initial","type":"number","required":false,"defaultValue":0/);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("delegates Voo component requests to Vite's resolver", async () => {
  const plugin = vooya();
  const cases = [
    {
      name: "relative import",
      source: "./Counter.voo",
      importer: "/project/src/App.vue",
      resolved: "/project/src/Counter.voo",
    },
    {
      name: "root-relative import",
      source: "/src/Counter.voo",
      importer: "/project/src/App.vue",
      resolved: "/project/src/Counter.voo",
    },
    {
      name: "configured alias",
      source: "@/Counter.voo",
      importer: "/project/src/App.vue",
      resolved: "/project/src/Counter.voo",
    },
    {
      name: "package subpath",
      source: "@acme/ui/Counter.voo",
      importer: "/project/src/App.vue",
      resolved: "/project/node_modules/@acme/ui/Counter.voo",
    },
    {
      name: "queried importer",
      source: "./Counter.voo",
      importer: "/project/src/App.vue?vue&type=script&lang.ts",
      resolved: "/project/src/Counter.voo",
    },
  ];

  for (const fixture of cases) {
    const calls = [];
    const hookOptions = { ssr: false };
    const result = await plugin.resolveId.call(
      {
        resolve(source, importer, options) {
          calls.push({ source, importer, options });
          return Promise.resolve({ id: fixture.resolved });
        },
      },
      fixture.source,
      fixture.importer,
      hookOptions,
    );

    assert.deepEqual(result, { id: fixture.resolved }, fixture.name);
    assert.deepEqual(calls, [
      {
        source: fixture.source,
        importer: fixture.importer,
        options: { ...hookOptions, skipSelf: true },
      },
    ], fixture.name);
  }
});

test("leaves unresolved Voo component requests to Vite's normal diagnostics", async () => {
  const plugin = vooya();
  let calls = 0;
  const result = await plugin.resolveId.call(
    {
      resolve() {
        calls += 1;
        return null;
      },
    },
    "@/Missing.voo",
    "/project/src/App.vue",
  );

  assert.equal(result, null);
  assert.equal(calls, 1);
});

test("keeps virtual styles and unrelated requests out of Vite delegation", async () => {
  const plugin = vooya();
  const context = {
    resolve() {
      throw new Error("unexpected resolver delegation");
    },
  };

  assert.equal(
    await plugin.resolveId.call(context, "virtual:vooya-style:Counter.voo.css", "/project/src/App.vue"),
    "\0virtual:vooya-style:Counter.voo.css",
  );
  assert.equal(await plugin.resolveId.call(context, "./App.ts", "/project/src/main.ts"), null);
  assert.equal(await plugin.resolveId.call(context, "./Counter.voo"), null);
});
