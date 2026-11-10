import assert from "node:assert/strict";
import test from "node:test";

const stages = new Set(["discovery", "toolchain", "compile", "link", "asset", "contract", "load", "runtime"]);
const severities = new Set(["error", "warning", "info"]);

/**
 * Internal normalized diagnostic boundary for provider canaries. Provider
 * adapters normalize compiler/runtime output before framework or bundler code
 * observes it; this fixture deliberately does not parse any compiler.
 */
function normalizeDiagnostic(input, { projectRoot, provider, version }) {
  if (!stages.has(input.stage)) throw new Error(`Unknown provider diagnostic stage ${String(input.stage)}.`);
  if (!severities.has(input.severity)) throw new Error(`Unknown provider diagnostic severity ${String(input.severity)}.`);
  if (typeof input.message !== "string" || !input.message.trim()) throw new Error("Provider diagnostic needs a message.");
  if (typeof provider !== "string" || !provider || typeof version !== "string" || !version) throw new Error("Provider diagnostic needs provider identity and version.");
  const source = normalizeSource(input.source, projectRoot);
  const generated = normalizeGenerated(input.generated, projectRoot);
  return {
    stage: input.stage,
    severity: input.severity,
    message: input.message,
    provider: { name: provider, version },
    ...(source ? { source } : {}),
    ...(generated ? { generated } : {}),
    ...(input.hint ? { hint: input.hint } : {}),
  };
}

function normalizeSource(source, projectRoot) {
  if (source === undefined) return undefined;
  if (!source || typeof source !== "object" || typeof source.file !== "string" || !source.file) throw new Error("Provider diagnostic source needs a file.");
  if (source.file.startsWith(projectRoot)) throw new Error("Provider diagnostic source must use a project-relative identity.");
  if (source.line !== undefined && (!Number.isInteger(source.line) || source.line < 1)) throw new Error("Provider diagnostic source line must be positive.");
  if (source.column !== undefined && (!Number.isInteger(source.column) || source.column < 1)) throw new Error("Provider diagnostic source column must be positive.");
  return { file: source.file, ...(source.line ? { line: source.line } : {}), ...(source.column ? { column: source.column } : {}) };
}

function normalizeGenerated(generated, projectRoot) {
  if (generated === undefined) return undefined;
  if (!generated || typeof generated !== "object" || typeof generated.asset !== "string" || !generated.asset) throw new Error("Provider diagnostic generated location needs an asset.");
  if (generated.asset.startsWith(projectRoot)) throw new Error("Provider diagnostic generated asset must use a logical identity.");
  return { asset: generated.asset, ...(generated.line ? { line: generated.line } : {}), ...(generated.column ? { column: generated.column } : {}) };
}

test("normalizes authored source diagnostics without compiler-specific fields", () => {
  const diagnostic = normalizeDiagnostic({
    stage: "compile", severity: "error", message: "expected expression",
    source: { file: "stores/cart.go", line: 12, column: 8 }, hint: "Correct the expression and rebuild.",
  }, { projectRoot: "C:\\work\\cart", provider: "go", version: "1.26.0" });
  assert.deepEqual(diagnostic, {
    stage: "compile", severity: "error", message: "expected expression",
    provider: { name: "go", version: "1.26.0" },
    source: { file: "stores/cart.go", line: 12, column: 8 },
    hint: "Correct the expression and rebuild.",
  });
});

test("keeps generated asset failures distinct when no authored source span exists", () => {
  const diagnostic = normalizeDiagnostic({
    stage: "asset", severity: "error", message: "runtime support script is missing",
    generated: { asset: "runtime/wasm_exec.js" }, hint: "Install the matching runtime asset.",
  }, { projectRoot: "/workspace", provider: "go", version: "1.26.0" });
  assert.equal("source" in diagnostic, false);
  assert.deepEqual(diagnostic.generated, { asset: "runtime/wasm_exec.js" });
});

test("rejects host paths, unknown stages and guessed source locations", () => {
  assert.throws(() => normalizeDiagnostic({ stage: "compile", severity: "error", message: "bad", source: { file: "/workspace/src/store.zig" } }, { projectRoot: "/workspace", provider: "zig", version: "0.15.0" }), /project-relative/);
  assert.throws(() => normalizeDiagnostic({ stage: "compiler", severity: "error", message: "bad" }, { projectRoot: "/workspace", provider: "zig", version: "0.15.0" }), /Unknown provider diagnostic stage/);
  assert.throws(() => normalizeDiagnostic({ stage: "link", severity: "error", message: "bad", source: { file: "src/store.zig", line: 0 } }, { projectRoot: "/workspace", provider: "zig", version: "0.15.0" }), /line must be positive/);
});
