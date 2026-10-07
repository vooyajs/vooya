import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
// Exercise the actual generator without requiring a Rust build or stale dist output.
// Use file modules so the generator's runtime error dependency resolves normally.
const generatorDir = mkdtempSync(join(root, ".store-types-generator-"));
let generateRustStoreDeclaration;
try {
  for (const name of ["errors", "schema-declarations"]) {
    const compiled = ts.transpileModule(
      readFileSync(resolve(root, `packages/provider-rust/source/${name}.ts`), "utf8"),
      { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
    ).outputText;
    writeFileSync(join(generatorDir, `${name}.js`), compiled);
  }
  ({ generateRustStoreDeclaration } = await import(pathToFileURL(join(generatorDir, "schema-declarations.js")).href));
} finally {
  rmSync(generatorDir, { recursive: true, force: true });
}

export function checkGeneratedStoreTypes(framework) {
  const dir = mkdtempSync(join(root, ".store-types-"));
  try {
    const declaration = generateRustStoreDeclaration(
      {
        version: 1,
        kind: "store",
        id: "counter",
        name: "Counter",
        snapshot: "i32",
        actions: [{ name: "add", params: [{ name: "amount", type: "i32" }] }],
      },
      framework,
    );
    assert.doesNotMatch(declaration, /\[\w+: string\]/);
    writeFileSync(join(dir, "Counter.d.rs.ts"), declaration);
    const state =
      framework === "vue"
        ? "binding.snapshot.value"
        : framework === "solid"
          ? "binding.state()"
          : framework === "svelte"
            ? "get(binding.state)"
            : "binding.state";
    const source =
      framework === "vue"
        ? "createCounterStore()"
        : "createCounterStore, undefined";
    writeFileSync(
      join(dir, "consumer.ts"),
      `
import { useVooyaStore, defineVooyaStore } from "@vooya/${framework}";
import { createCounterStore, type CounterStore, useCounter } from "./Counter.d.rs";
${framework === "svelte" ? 'import { get } from "svelte/store";' : ""}
declare const direct: CounterStore;
${framework === "vue" ? "useVooyaStore(direct);" : "useVooyaStore(() => direct, undefined);"}
const binding = useVooyaStore(${source});
const snapshot: number | undefined = ${state};
// @ts-expect-error snapshots must not be widened to any
const wrongSnapshot: string = ${state};
const generated = useCounter();
generated.add(1);
// @ts-expect-error generated actions retain their argument types
generated.add("wrong");
createCounterStore().then(store => {
  store.add(1);
  // @ts-expect-error interfaces must not acquire arbitrary action names
  store.missingAction();
  // @ts-expect-error factory actions retain their argument types
  store.add("wrong");
});
${framework === "vue" ? "useVooyaStore<number>(createCounterStore());" : "useVooyaStore<number, undefined, CounterStore>(createCounterStore, undefined);"}
defineVooyaStore({ name: "Counter", create: createCounterStore, actions: ["add"] });
${framework === "vue" ? "" : 'binding.store?.add(1);\n// @ts-expect-error adapter store retains action arguments\nbinding.store?.add("wrong");'}
`,
    );
    writeFileSync(
      join(dir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          noEmit: true,
          strict: true,
          skipLibCheck: true,
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          baseUrl: root,
          paths: {
            [`@vooya/${framework}`]: [`packages/${framework}/dist/index.d.ts`],
          },
        },
        files: ["consumer.ts"],
      }),
    );
    const result = spawnSync(
      process.execPath,
      [
        resolve(root, "node_modules/typescript/bin/tsc"),
        "-p",
        join(dir, "tsconfig.json"),
      ],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
