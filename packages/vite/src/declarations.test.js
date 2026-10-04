import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import ts from "typescript";

test("emitted declarations compose with Vite and retain typed runtime results", () => {
  const root = mkdtempSync(resolve(import.meta.dirname, ".type-contract-"));
  try {
    const file = resolve(root, "consumer.mts");
    writeFileSync(file, `
import { defineConfig, type Plugin } from "vite";
import { vooya } from "../../dist/index.js";
import { initializeWasm } from "../../dist/runtime.js";
import { inspectToolchain } from "../../dist/doctor.js";
import { createBuildScheduler } from "../../dist/build-scheduler.js";
const plugin: Plugin = vooya({ framework: "vue", toolchain: { mode: "system" } });
defineConfig({ plugins: [plugin] });
const result: Promise<{ memory: WebAssembly.Memory }> = initializeWasm(async () => ({ memory: new WebAssembly.Memory({ initial: 1 }) }));
inspectToolchain({ cargoPath: "/tools/cargo", workspaceRoot: ".generated", run(command, args, options) { return options?.cwd ?? ""; } });
createBuildScheduler({ build() {}, onError(error) {
  // @ts-expect-error thrown values must be narrowed before reading a message
  error.message;
} });
// @ts-expect-error unsupported framework should not silently become Vue
vooya({ framework: "angular" });
// @ts-expect-error a resolved initializer value is not an arbitrary number
const wrong: Promise<number> = initializeWasm(() => ({ ready: true }));
`);
    const program = ts.createProgram([file], { strict: true, noEmit: true, skipLibCheck: true,
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCurrentDirectory: () => root, getCanonicalFileName: (name) => name, getNewLine: () => "\n",
    }));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
