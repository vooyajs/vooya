import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { vooya } from "../dist/index.js";
import { assertBindingsRetry } from "./module-loading-helper.js";

for (const format of ["source", "manifest"]) {
  test(`generated ${format} .voo module retries failed loading and shares pending and successful bindings`, async () => {
    const root = mkdtempSync(resolve(tmpdir(), "vooya-loading-"));
    const id = resolve(root, "Counter.voo");
    try {
      writeFileSync(id, format === "source" ? `<component name="Counter">
props:
  initial: i32 = 0
</component>
<rust>pub struct Component;</rust>` : `component Counter
runtime: legacy-runtime
export: counter
adapter:
  vue: Counter
`);
      const plugin = vooya();
      plugin.configResolved({ root });
      await assertBindingsRetry(plugin.load.call({}, id), format === "source" ? {
        runtimeSpecifier: "virtual:vooya-runtime",
        exports: ["voo_counter_mount", "voo_counter_dispose", "voo_counter_update_initial"],
      } : {
        runtimeSpecifier: "legacy-runtime",
        exports: ["counter"],
        legacyFactory: "Counter",
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
