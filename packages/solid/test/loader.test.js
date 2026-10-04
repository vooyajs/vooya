import { execFileSync } from "node:child_process";
import test from "node:test";

// Solid's default Node export disables onMount. Exercise its browser runtime.
test("Solid binding load failures reach onError in the browser lifecycle", () => {
  execFileSync(process.execPath, ["--conditions=browser", "--input-type=module", "-e", `
    import assert from "node:assert/strict";
    import { JSDOM } from "jsdom";
    import { createRoot } from "solid-js";
    import { defineVooyaComponent } from "./dist/index.js";
    const dom = new JSDOM("<body></body>");
    globalThis.document = dom.window.document;
    for (const asynchronous of [false, true]) {
      const cause = new Error("binding unavailable");
      const errors = [];
      let dispose;
      createRoot((cleanup) => {
        dispose = cleanup;
        const Component = defineVooyaComponent({
          abiVersion: 1, name: "FailedLoader", props: [], events: [],
        }, () => {
          if (asynchronous) return Promise.reject(cause);
          throw cause;
        });
        document.body.append(Component({ onError: (error) => errors.push(error) }));
      });
      await new Promise((resolve) => setImmediate(resolve));
      assert.deepEqual(errors, [{ stage: "load", cause }]);
      dispose();
    }
    for (const fails of [false, true]) {
      const errors = [];
      let mounts = 0;
      let settle;
      let dispose;
      createRoot((cleanup) => {
        dispose = cleanup;
        const Component = defineVooyaComponent({ abiVersion: 1, name: "Late", props: [], events: [] },
          () => new Promise((resolve, reject) => {
            settle = () => fails ? reject(new Error("late failure")) : resolve({ mount() { mounts++; return { dispose() {} }; } });
          }));
        Component({ onError: (error) => errors.push(error) });
      });
      dispose();
      await Promise.resolve();
      settle();
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(mounts, 0);
      assert.deepEqual(errors, []);
    }
    dom.window.close();
  `], { cwd: new URL("..", import.meta.url), stdio: "pipe" });
});
