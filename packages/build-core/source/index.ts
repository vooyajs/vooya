// This package is intentionally bundler-neutral: adapters own virtual modules,
// watching and presentation, while this module owns the Rust/WASM application build.
// @ts-nocheck
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { generateRustComponents, generatedAdapterDefinition, generatedComponentPrelude } from "@vooya/compiler";

const require = createRequire(import.meta.url);

export function resolveRuntimeCrateRoot() {
  return dirname(require.resolve("@vooya/core/rust/Cargo.toml"));
}

export function resolveRustDependencyRoots(rust = {}, applicationRoot) {
  if (!isPlainObject(rust.dependencies)) return [];
  return Object.values(rust.dependencies)
    .filter((specification) => isPlainObject(specification) && specification.path)
    .map((specification) => resolve(applicationRoot, specification.path));
}

/**
 * Build compiler results into a reusable WASM application artifact. `components`
 * are the parsed `.voo` compiler results; callers retain all bundler-specific IO.
 */
export function buildApplication({
  applicationRoot,
  components = [],
  rust = {},
  runtimeCrateRoot = resolveRuntimeCrateRoot(),
  cacheRoot = resolve(applicationRoot, ".voo-cache"),
  workspacePath = cacheRoot,
  outputDir = resolve(cacheRoot, "dist"),
  buildMode = "production",
  onRustBuildStart = () => {},
} = {}) {
  if (typeof applicationRoot !== "string" || !applicationRoot) throw new Error("Vooya build requires applicationRoot.");
  if (!Array.isArray(components)) throw new Error("Vooya build requires compiler result components as an array.");
  const sourceDir = resolve(workspacePath, "src/components");
  const targetDir = resolve(workspacePath, "target");
  const sourcePaths = new Map();
  const diagnosticMappings = new Map();
  mkdirSync(sourceDir, { recursive: true });
  for (const [index, component] of components.entries()) {
    const sourcePath = resolve(sourceDir, `${index}-${component.name}.rs`);
    const prelude = generatedComponentPrelude(component);
    writeIfChanged(sourcePath, `${prelude}${component.rust.content}\n`);
    sourcePaths.set(component.id, sourcePath);
    diagnosticMappings.set(sourcePath, { id: component.id, startLine: component.rust.startLine, generatedLineOffset: prelude.split(/\r?\n/).length - 1 });
  }
  writeIfChanged(resolve(workspacePath, "Cargo.toml"), generatedCargoManifest({ applicationRoot, runtimeCrateRoot, rust }));
  writeIfChanged(resolve(workspacePath, "src/lib.rs"), `pub use vooya_core::*;\n\n${generateRustComponents(components, sourcePaths)}`);
  onRustBuildStart();
  const diagnostics = runCargo(applicationRoot, ["build", "--manifest-path", resolve(workspacePath, "Cargo.toml"), ...(buildMode === "development" ? [] : ["--release"]), "--target", "wasm32-unknown-unknown", "--target-dir", targetDir], diagnosticMappings);
  // Adapters may expose this directory to a bundler module graph. Do not
  // remove it between builds: Webpack can observe the brief missing-file gap.
  mkdirSync(outputDir, { recursive: true });
  execFileSync("wasm-bindgen", [resolve(targetDir, `wasm32-unknown-unknown/${buildMode === "development" ? "debug" : "release"}/vooya_app.wasm`), "--target", "web", "--out-dir", outputDir], { cwd: applicationRoot, stdio: "inherit" });
  const runtimeModule = resolve(outputDir, "vooya_app.js");
  const wasm = resolve(outputDir, "vooya_app_bg.wasm");
  return {
    cacheRoot: workspacePath, runtimeModule,
    javascript: { path: runtimeModule, code: readFileSync(runtimeModule, "utf8") },
    wasm: { path: wasm, bytes: readFileSync(wasm) }, css: [], declarations: [],
    watchedFiles: [resolve(runtimeCrateRoot, "src"), ...resolveRustDependencyRoots(rust, applicationRoot)],
    diagnostics, metadata: { buildMode, abiVersions: components.map((component) => generatedAdapterDefinition(component).abiVersion), wasmBindgenTarget: "web" },
  };
}

// Builds the empty runtime artifact shipped by @vooya/core without depending on
// the Vite package. The root is supplied by the repository build script.
export function buildCore(root = process.cwd()) {
  return buildApplication({
    applicationRoot: root,
    cacheRoot: resolve(root, "target/vooya-package"),
    outputDir: resolve(root, "packages/core/dist"),
  });
}

export function generatedCargoManifest({ applicationRoot, runtimeCrateRoot, rust = {} }) {
  const dependencies = generatedUserDependencies(rust.dependencies, applicationRoot);
  return `[package]\nname = "vooya-app"\nversion = "0.0.0"\nedition = "2024"\n\n[workspace]\n\n[lib]\ncrate-type = ["cdylib"]\n\n[dependencies]\nvooya-core = { path = ${JSON.stringify(runtimeCrateRoot)} }\njs-sys = "=0.3.92"\nwasm-bindgen = "=0.2.115"\nweb-sys = { version = "=0.3.92", features = [\n${mergedWebSysFeatures(rust.webSysFeatures).map((feature) => `  ${JSON.stringify(feature)},`).join("\n")}\n] }\n${dependencies}\n`;
}
const builtInWebSysFeatures = ["CustomEvent", "CustomEventInit", "Document", "Element", "Event", "EventTarget", "HtmlCollection", "HtmlElement", "HtmlInputElement", "Node", "Window"];
const reservedDependencies = new Set(["js-sys", "vooya-core", "wasm-bindgen", "web-sys"]);
const dependencyKeys = new Set(["branch", "defaultFeatures", "features", "git", "package", "path", "rev", "tag", "version"]);
function mergedWebSysFeatures(features = []) { if (!Array.isArray(features)) throw new Error("Vooya rust.webSysFeatures must be an array."); for (const f of features) if (typeof f !== "string" || !/^[A-Za-z][A-Za-z0-9]*$/.test(f)) throw new Error(`Invalid web-sys feature ${JSON.stringify(f)}.`); return [...new Set([...builtInWebSysFeatures, ...features])].sort(); }
function generatedUserDependencies(dependencies = {}, applicationRoot) { if (!isPlainObject(dependencies)) throw new Error("Vooya rust.dependencies must be an object."); return Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b)).map(([name, specification]) => { if (!/^[A-Za-z0-9_-]+$/.test(name)) throw new Error(`Invalid Rust dependency name ${JSON.stringify(name)}.`); if (reservedDependencies.has(name)) throw new Error(`Rust dependency ${JSON.stringify(name)} is managed by Vooya and cannot be overridden.`); return `${JSON.stringify(name)} = ${generatedDependencySpecification(name, specification, applicationRoot)}`; }).join("\n"); }
function generatedDependencySpecification(name, specification, root) { if (typeof specification === "string" && specification) return JSON.stringify(specification); if (!isPlainObject(specification)) throw new Error(`Rust dependency ${JSON.stringify(name)} must be a version or an object.`); const unknown = Object.keys(specification).find((key) => !dependencyKeys.has(key)); if (unknown) throw new Error(`Rust dependency ${JSON.stringify(name)} has unsupported option ${JSON.stringify(unknown)}.`); if (!specification.version && !specification.path && !specification.git) throw new Error(`Rust dependency ${JSON.stringify(name)} requires version, path, or git.`); if (specification.path && specification.git) throw new Error(`Rust dependency ${JSON.stringify(name)} cannot combine path and git.`); const refs = ["branch", "tag", "rev"].filter((key) => specification[key]); if (refs.length && !specification.git) throw new Error(`Rust dependency ${JSON.stringify(name)} option ${refs[0]} requires git.`); if (refs.length > 1) throw new Error(`Rust dependency ${JSON.stringify(name)} can use only one of branch, tag, or rev.`); const values = []; for (const key of ["version", "path", "git", "branch", "tag", "rev", "package"]) { const value = specification[key]; if (value === undefined) continue; if (typeof value !== "string" || !value) throw new Error(`Rust dependency ${JSON.stringify(name)} option ${key} must be a string.`); values.push(`${key} = ${JSON.stringify(key === "path" ? resolve(root, value) : value)}`); } if (specification.defaultFeatures !== undefined) { if (typeof specification.defaultFeatures !== "boolean") throw new Error(`Rust dependency ${JSON.stringify(name)} option defaultFeatures must be a boolean.`); values.push(`default-features = ${specification.defaultFeatures}`); } if (specification.features !== undefined) { if (!Array.isArray(specification.features) || specification.features.some((feature) => typeof feature !== "string" || !feature)) throw new Error(`Rust dependency ${JSON.stringify(name)} option features must be a string array.`); values.push(`features = [${specification.features.map(JSON.stringify).join(", ")}]`); } return `{ ${values.join(", ")} }`; }
function isPlainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
export function remapRustDiagnostic(message, mappings) { let rendered = message.rendered ?? `${message.level}: ${message.message}\n`; for (const span of message.spans ?? []) { const mapping = mappings.get(resolve(span.file_name)); if (!mapping) continue; const line = mapping.startLine + span.line_start - 1 - (mapping.generatedLineOffset ?? 0); rendered = rendered.replaceAll(`${span.file_name}:${span.line_start}:${span.column_start}`, `${mapping.id}:${line}:${span.column_start}`).replace(new RegExp(`(\\n\\s*)${span.line_start}(\\s+\\|)`), `$1${line}$2`); } return rendered; }
function runCargo(root, args, mappings) { const result = spawnSync("cargo", [...args, "--message-format=json"], { cwd: root, encoding: "utf8", env: { ...process.env, CARGO_TERM_COLOR: "never" } }); const diagnostics = []; if (result.stderr) process.stderr.write(result.stderr); for (const line of result.stdout.split(/\r?\n/)) { if (!line) continue; try { const message = JSON.parse(line); if (message.reason === "compiler-message") { const mapped = remapRustDiagnostic(message.message, mappings); diagnostics.push(mapped); process.stderr.write(mapped); } } catch { process.stderr.write(`${line}\n`); } } if (result.error) throw result.error; if (result.status !== 0) throw new Error(`Cargo build failed with exit code ${result.status}.`); return diagnostics; }
function writeIfChanged(path, content) { mkdirSync(dirname(path), { recursive: true }); try { if (readFileSync(path, "utf8") === content) return; } catch (error) { if (error.code !== "ENOENT") throw error; } writeFileSync(path, content); }
