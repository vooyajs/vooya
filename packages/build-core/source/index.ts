// This package is intentionally bundler-neutral: adapters own virtual modules,
// watching and presentation, while this module owns the Rust/WASM application build.
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, relative, resolve } from "node:path";

import { CargoBuildError, VooyaUserError } from "./errors.js";
import { resolveRustBuildOptions } from "./cargo-manifest.js";
import type { RustBuildOptions, RustDependency } from "./cargo-manifest.js";
import { resolveToolchain } from "./toolchain.js";
import type { ResolvedToolchain, ToolchainEnvironment } from "./toolchain.js";
import {
  compileVooStyle,
  generateRustComponents,
  generateVooDeclaration,
  generatedAdapterDefinition,
  generatedComponentPrelude,
} from "@vooya/compiler";
import type { SourceComponent } from "@vooya/compiler";
import {
  ensureVooyaWorkspace,
  resolveVooyaWorkspace,
  writeWorkspaceMetadata,
} from "./workspace.js";
import { buildRustComponentContracts, indexVooyaSchema, readVooyaSchema, validateVooyaSchemaGroups } from "./schema.js";
import { generateRustSchemaDeclaration, generateRustStoreDeclaration } from "./schema-declarations.js";
import type { RustSchemaDocument } from "./schema.js";
import { createRustArtifact, validateArtifact } from "./artifact.js";
import type { VooyaArtifactManifest } from "./artifact.js";

const require = createRequire(import.meta.url);

export * from "./errors.js";
export * from "./cargo-manifest.js";
export * from "./schema.js";
export * from "./schema-declarations.js";
export * from "./toolchain.js";
export * from "./workspace.js";
export * from "./artifact.js";

export type MappedDiagnostic = string;
export interface BuildAsset { path: string; code: string }
export interface WasmAsset { path: string; bytes: Uint8Array }
export interface GeneratedCss { componentId: string; code: string }
export interface GeneratedDeclaration {
  componentId: string;
  framework: "vue" | "react" | "solid" | "svelte";
  code: string;
}
export interface BuildMetadata {
  buildMode: "production" | "development";
  abiVersions: number[];
  wasmBindgenTarget: "web";
}

export interface BuildSpawnResult {
  status: number | null;
  stdout?: string | null;
  stderr?: string | null;
  error?: unknown;
}

export type BuildSpawn = (
  command: string,
  args: string[],
  options: {
    cwd: string;
    encoding: "utf8";
    env: ToolchainEnvironment;
  },
) => BuildSpawnResult;

export type BuildExec = (
  command: string,
  args: string[],
  options: {
    cwd: string;
    env: ToolchainEnvironment;
    stdio: "inherit";
  },
) => unknown;

export interface BuildApplicationOptions {
  applicationRoot: string;
  components?: SourceComponent[];
  rust?: RustBuildOptions;
  runtimeCrateRoot?: string;
  workspaceRoot?: string;
  workspacePath?: string;
  outputDir?: string;
  buildMode?: "production" | "development";
  framework?: "vue" | "react" | "solid" | "svelte";
  onRustBuildStart?: () => void;
  toolchain?: ResolvedToolchain;
  spawn?: BuildSpawn;
  exec?: BuildExec;
}

/** Convert a user Rust path into a deterministic Rust module identifier. */
export function rustModuleIdentifier(path: string): string {
  const stem = path.replaceAll("\\", "/").replace(/\.rs$/i, "").split("/").pop() ?? "module";
  const normalized = stem.replace(/[^A-Za-z0-9_]/g, "_").replace(/^[^A-Za-z_]+/, "_");
  return normalized || "module";
}

/**
 * Generate a crate root for ordinary Rust files. `publicFiles` are the only
 * files exposed from the JS-facing root; all other modules remain internal.
 */
export function generateRustCrateRoot(
  files: string[],
  publicFiles: string[] = [],
): string {
  const publicSet = new Set(publicFiles.map((file) => file.replaceAll("\\", "/")));
  const used = new Set<string>();
  const declarations: string[] = [];
  for (const file of [...files].sort()) {
    const normalized = file.replaceAll("\\", "/");
    let identifier = rustModuleIdentifier(normalized);
    if (used.has(identifier)) {
      let suffix = 2;
      while (used.has(`${identifier}_${suffix}`)) suffix += 1;
      identifier = `${identifier}_${suffix}`;
    }
    used.add(identifier);
    const visibility = publicSet.has(normalized) ? "pub " : "";
    declarations.push(`#[path = ${JSON.stringify(normalized)}] ${visibility}mod ${identifier};`);
  }
  return `${declarations.join("\n")}\n`;
}

/** Keep only files that can be declared directly by a conventional crate root. */
export function selectRustRootModules(files: string[], rootPrefix = ""): string[] {
  const prefix = rootPrefix.replaceAll("\\", "/").replace(/\/$/, "");
  return [...files]
    .map((file) => file.replaceAll("\\", "/"))
    .filter((file) => {
      const relative = prefix && file.startsWith(`${prefix}/`) ? file.slice(prefix.length + 1) : file;
      const parts = relative.split("/");
      return parts.length === 1 || (parts.length === 2 && parts[1] === "mod.rs");
    })
    .sort();
}

/** Resolve only an explicitly configured authored entry. */
export function resolveVooyaCrateRoot(
  applicationRoot: string,
  configuredEntry?: string,
): string | undefined {
  if (!configuredEntry) return undefined;
  return [configuredEntry]
    .map((candidate) => resolve(applicationRoot, candidate))
    .find((candidate) => {
      try { return statSync(candidate).isFile(); } catch { return false; }
    });
}

/** Discover authored Rust modules without requiring a manifest edit. */
export function discoverRustSourceFiles(applicationRoot: string, configuredRoot = "src"): string[] {
  const sourceRoot = resolve(applicationRoot, configuredRoot);
  const files: string[] = [];
  const visit = (directory: string): void => {
    const entries = (() => {
      try {
        return readdirSync(directory, { withFileTypes: true, encoding: "utf8" });
      } catch {
        return [];
      }
    })();
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "target" && entry.name !== ".vooya") visit(path);
      } else if (entry.isFile() && entry.name.endsWith(".rs") && entry.name !== "lib.rs" && entry.name !== "main.rs") {
        files.push(path);
      }
    }
  };
  visit(sourceRoot);
  return files;
}

export interface BuildApplicationResult {
  workspaceRoot: string;
  runtimeModule: string;
  javascript: BuildAsset;
  wasm: WasmAsset;
  css: GeneratedCss[];
  declarations: GeneratedDeclaration[];
  schema: RustSchemaDocument;
  watchedFiles: string[];
  diagnostics: MappedDiagnostic[];
  metadata: BuildMetadata;
  artifact: VooyaArtifactManifest;
}

interface DiagnosticMapping {
  id: string;
  startLine: number;
  generatedLineOffset: number;
}

interface CargoDiagnostic {
  level?: string;
  message: string;
  rendered?: string;
  spans?: Array<{
    file_name: string;
    line_start: number;
    column_start: number;
  }>;
}

export function resolveRuntimeCrateRoot(): string {
  return dirname(require.resolve("@vooya/core/rust/Cargo.toml"));
}

/** Resolve the public authoring crate shipped alongside the runtime in the
 * workspace, or alongside `@vooya/core` in a packed installation. */
export function resolveVooyaAuthoringCrateRoot(runtimeCrateRoot = resolveRuntimeCrateRoot()): string | undefined {
  const candidates = [
    resolve(runtimeCrateRoot, "authoring"),
    resolve(runtimeCrateRoot, "..", "authoring"),
    resolve(runtimeCrateRoot, "..", "..", "..", "crates/vooya"),
  ];
  return candidates.find((candidate) => {
    try { return statSync(resolve(candidate, "Cargo.toml")).isFile(); } catch { return false; }
  });
}

export function resolveRustDependencyRoots(
  rust: RustBuildOptions = {},
  applicationRoot: string,
): string[] {
  return Object.values(rust.dependencies ?? {})
    .filter(
      (specification): specification is Exclude<RustDependency, string> =>
        typeof specification !== "string" && typeof specification.path === "string",
    )
    .map((specification) => resolve(applicationRoot, specification.path as string));
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
  workspaceRoot,
  workspacePath,
  outputDir,
  buildMode = "production",
  framework = "vue",
  onRustBuildStart = () => {},
  toolchain = resolveToolchain({ cwd: applicationRoot }),
  spawn = spawnSync,
  exec = execFileSync,
}: BuildApplicationOptions): BuildApplicationResult {
  if (!applicationRoot) throw new Error("Vooya build requires applicationRoot.");
  const resolvedRust = resolveRustBuildOptions(applicationRoot, rust);
  rust = resolvedRust.rust;
  const workspace = resolveVooyaWorkspace(applicationRoot, workspaceRoot);
  ensureVooyaWorkspace(workspace);
  workspacePath ??= workspace.build;
  outputDir ??= workspace.wasm;

  const sourceDir = resolve(workspacePath, "src/components");
  const rustSourceDir = resolve(workspacePath, "src/rust");
  const targetDir = resolve(workspacePath, "target");
  const sourcePaths = new Map<string | undefined, string>();
  const diagnosticMappings = new Map<string, DiagnosticMapping>();

  mkdirSync(sourceDir, { recursive: true });
  // This directory is generated state. Reconcile it on every build so removed
  // or renamed source files cannot remain as phantom Rust modules.
  rmSync(rustSourceDir, { force: true, recursive: true });
  mkdirSync(rustSourceDir, { recursive: true });
  for (const [index, component] of components.entries()) {
    const sourcePath = resolve(sourceDir, `${index}-${component.name}.rs`);
    const prelude = generatedComponentPrelude(component);
    writeIfChanged(sourcePath, `${prelude}${component.rust.content}\n`);
    sourcePaths.set(component.id, sourcePath);
    diagnosticMappings.set(sourcePath, {
      id: component.id ?? component.name,
      startLine: component.rust.startLine,
      generatedLineOffset: prelude.split(/\r?\n/).length - 1,
    });
  }

  const authoredEntry = resolveVooyaCrateRoot(applicationRoot, rust.entry);
  const configuredSourceRoot = rust.sourceRoot ?? "src";
  const rustFiles = [...new Set([
    ...discoverRustSourceFiles(applicationRoot, configuredSourceRoot),
    ...(rust.files ?? []).map((file) => resolve(applicationRoot, file)),
  ])];
  const copiedRustFiles: string[] = [];
  for (const file of rustFiles) {
    const relativePath = relative(applicationRoot, file).replaceAll("\\", "/");
    const destination = resolve(rustSourceDir, relativePath);
    mkdirSync(dirname(destination), { recursive: true });
    writeIfChanged(destination, readFileSync(file, "utf8"));
    diagnosticMappings.set(destination, {
      id: file,
      startLine: 1,
      generatedLineOffset: 0,
    });
    copiedRustFiles.push(`rust/${relativePath}`);
  }
  if (authoredEntry && !rustFiles.includes(authoredEntry)) {
    const relativePath = relative(applicationRoot, authoredEntry).replaceAll("\\", "/");
    const destination = resolve(rustSourceDir, relativePath);
    mkdirSync(dirname(destination), { recursive: true });
    writeIfChanged(destination, readFileSync(authoredEntry, "utf8"));
    diagnosticMappings.set(destination, {
      id: authoredEntry,
      startLine: 1,
      generatedLineOffset: 0,
    });
    copiedRustFiles.push(`rust/${relativePath}`);
  }

  writeIfChanged(
    resolve(workspacePath, "Cargo.toml"),
    generatedCargoManifest({
      applicationRoot,
      runtimeCrateRoot,
      authoringCrateRoot: resolveVooyaAuthoringCrateRoot(runtimeCrateRoot),
      rust,
    }),
  );
  const authoredModule = authoredEntry
    ? `#[path = ${JSON.stringify(`rust/${relative(applicationRoot, authoredEntry).replaceAll("\\", "/")}`)}] pub mod app;\npub use app::*;`
    : (() => {
        const rootPrefix = `rust/${configuredSourceRoot}`.replaceAll("\\", "/");
        const publicFiles = (rust.public ?? []).map(
          (file) => `${rootPrefix}/${file.replaceAll("\\", "/")}`,
        );
        return generateRustCrateRoot(
          selectRustRootModules(copiedRustFiles, rootPrefix),
          selectRustRootModules(publicFiles, rootPrefix),
        );
      })();
  writeIfChanged(
    resolve(workspacePath, "src/lib.rs"),
    `pub use vooya_core::*;\n\n${authoredModule}\n\n${generateRustComponents(components, sourcePaths)}`,
  );

  onRustBuildStart();
  const diagnostics = runCargo(
    toolchain,
    applicationRoot,
    [
      "build",
      "--manifest-path",
      resolve(workspacePath, "Cargo.toml"),
      ...(buildMode === "development" ? [] : ["--release"]),
      "--target",
      "wasm32-unknown-unknown",
      "--target-dir",
      targetDir,
    ],
    diagnosticMappings,
    spawn,
  );

  rmSync(outputDir, { force: true, recursive: true });
  mkdirSync(outputDir, { recursive: true });
  try {
    exec(
      toolchain.wasmBindgen.path,
      [
        resolve(
          targetDir,
          `${toolchain.target.triple}/${buildMode === "development" ? "debug" : "release"}/vooya_app.wasm`,
        ),
        "--target",
        "web",
        "--out-dir",
        outputDir,
      ],
      { cwd: applicationRoot, env: toolchain.environment, stdio: "inherit" },
    );
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new VooyaUserError(
      `wasm-bindgen failed using ${toolchain.wasmBindgen.path}: ${detail}`,
      { kind: "wasm-bindgen", cause },
    );
  }

  const runtimeModule = resolve(outputDir, "vooya_app.js");
  const wasm = resolve(outputDir, "vooya_app_bg.wasm");
  const wasmBytes = new Uint8Array(readFileSync(wasm));
  // Test doubles and legacy precompiled artifacts may not contain a full WASM
  // binary. Treat those as schema-less artifacts; a real WASM binary is still
  // parsed strictly and malformed schema sections fail the build.
  const schema = isWasmBinary(wasmBytes)
    ? readVooyaSchema(wasmBytes)
    : { version: 1 as const, records: [] };
  const schemaIndex = indexVooyaSchema(schema);
  validateVooyaSchemaGroups(schemaIndex);
  const abiVersions = components.map(
    (component) => generatedAdapterDefinition(component).abiVersion,
  );
  writeWorkspaceMetadata(workspace, {
    abiVersions,
    toolchain: {
      cargo: toolchain.cargo.version,
      rustc: toolchain.rustc.version,
      target: toolchain.target.triple,
      wasmBindgen: toolchain.wasmBindgen.version,
    },
  });
  const schemaContracts = buildRustComponentContracts(schemaIndex);
  const artifact = validateArtifact(createRustArtifact({
    runtimeModule,
    wasm,
    abiVersion: abiVersions.length === 1 ? abiVersions[0] : undefined,
    watchedFiles: [
      ...(resolvedRust.manifestPath ? [resolvedRust.manifestPath] : []),
      resolve(runtimeCrateRoot, "src"),
      resolve(applicationRoot, configuredSourceRoot),
      ...resolveRustDependencyRoots(rust, applicationRoot),
    ],
  }));
  return {
    workspaceRoot: workspace.root,
    runtimeModule,
    javascript: { path: runtimeModule, code: readFileSync(runtimeModule, "utf8") },
    wasm: { path: wasm, bytes: wasmBytes },
    schema,
    css: components
      .filter((component) => component.style)
      .map((component) => ({
        componentId: component.id ?? component.name,
        code: compileVooStyle(component),
      })),
    declarations: components.length > 0
      ? components.map((component) => ({
          componentId: component.id ?? component.name,
          framework,
          code: generateVooDeclaration(component, framework),
        }))
      : [
        ...schemaContracts.map((contract) => ({
        componentId: contract.component.id,
        framework,
        code: generateRustSchemaDeclaration({ contract, framework }),
        })),
        ...schemaIndex.stores.map((store) => ({
          componentId: store.id,
          framework,
          code: generateRustStoreDeclaration(store, framework),
        })),
      ],
    watchedFiles: [
      ...(resolvedRust.manifestPath ? [resolvedRust.manifestPath] : []),
      resolve(runtimeCrateRoot, "src"),
      resolve(applicationRoot, configuredSourceRoot),
      ...resolveRustDependencyRoots(rust, applicationRoot),
    ],
    diagnostics,
    metadata: {
      buildMode,
      abiVersions,
      wasmBindgenTarget: "web",
    },
    artifact,
  };
}

// Builds the empty runtime artifact shipped by @vooya/core without depending on
// the Vite package. The root is supplied by the repository build script.
export function buildCore(root = process.cwd()): BuildApplicationResult {
  syncPackagedAuthoringCrates(root);
  return buildApplication({
    applicationRoot: root,
    workspaceRoot: resolve(root, "target/vooya-package"),
    outputDir: resolve(root, "packages/core/dist"),
  });
}

/**
 * The Rust authoring crate is part of the published @vooya/core source bundle,
 * not a second npm package. Keep the checked-in crates as the source of truth
 * and materialize package-relative manifests immediately before packaging.
 */
function syncPackagedAuthoringCrates(root: string): void {
  const runtimeRoot = resolve(root, "packages/core/rust");
  const authoringRoot = resolve(runtimeRoot, "authoring");
  const macrosRoot = resolve(runtimeRoot, "vooya-macros");
  const sourceAuthoring = resolve(root, "crates/vooya");
  const sourceMacros = resolve(root, "crates/vooya-macros");

  rmSync(authoringRoot, { force: true, recursive: true });
  rmSync(macrosRoot, { force: true, recursive: true });
  mkdirSync(authoringRoot, { recursive: true });
  mkdirSync(macrosRoot, { recursive: true });
  cpSync(resolve(sourceAuthoring, "Cargo.toml"), resolve(authoringRoot, "Cargo.toml"));
  cpSync(resolve(sourceAuthoring, "src"), resolve(authoringRoot, "src"), { recursive: true });
  cpSync(resolve(sourceMacros, "Cargo.toml"), resolve(macrosRoot, "Cargo.toml"));
  cpSync(resolve(sourceMacros, "src"), resolve(macrosRoot, "src"), { recursive: true });

  const manifestPath = resolve(authoringRoot, "Cargo.toml");
  const manifest = readFileSync(manifestPath, "utf8")
    .replace("edition.workspace = true", 'edition = "2024"')
    .replace("license.workspace = true", 'license = "MIT OR Apache-2.0"')
    .replace("repository.workspace = true", 'repository = "https://github.com/vooyajs/vooya"')
    .replace('path = "../../packages/core/rust"', 'path = ".."')
    .replace(
      /\r?\n\[\[example\]\]\r?\nname = "rsx_browser"\r?\ncrate-type = \["cdylib"\]\r?\n\r?\n\[dev-dependencies\]\r?\nwasm-bindgen-test = "=0\.3\.65"\r?\n?/m,
      "\n",
    );
  writeFileSync(manifestPath, manifest);

  const macrosManifestPath = resolve(macrosRoot, "Cargo.toml");
  const macrosManifest = readFileSync(macrosManifestPath, "utf8")
    .replace("edition.workspace = true", 'edition = "2024"')
    .replace("license.workspace = true", 'license = "MIT OR Apache-2.0"')
    .replace("repository.workspace = true", 'repository = "https://github.com/vooyajs/vooya"');
  writeFileSync(macrosManifestPath, macrosManifest);
}

function isWasmBinary(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && bytes[0] === 0 && bytes[1] === 0x61 && bytes[2] === 0x73 && bytes[3] === 0x6d;
}

export function generatedCargoManifest({
  applicationRoot,
  runtimeCrateRoot,
  authoringCrateRoot,
  rust = {},
}: {
  applicationRoot: string;
  runtimeCrateRoot: string;
  authoringCrateRoot?: string;
  rust?: RustBuildOptions;
}): string {
  const dependencies = generatedUserDependencies(rust.dependencies, applicationRoot);
  return `[package]
name = "vooya-app"
version = "0.0.0"
edition = "2024"

[workspace]

[lib]
crate-type = ["cdylib"]

# Keep release WASM artifacts compact. These settings apply to
# the generated application crate only; an existing user workspace remains
# under the user's control.
[profile.release]
opt-level = "s"
lto = true
codegen-units = 1
panic = "abort"

[dependencies]
vooya-core = { path = ${JSON.stringify(runtimeCrateRoot)} }
${authoringCrateRoot ? `vooya = { path = ${JSON.stringify(authoringCrateRoot)} }\n` : ""}js-sys = "=0.3.92"
wasm-bindgen = "=0.2.115"
web-sys = { version = "=0.3.92", features = [
${mergedWebSysFeatures(rust.webSysFeatures)
  .map((feature) => `  ${JSON.stringify(feature)},`)
  .join("\n")}
] }
${dependencies}
`;
}

const builtInWebSysFeatures = [
  "CustomEvent",
  "CustomEventInit",
  "Document",
  "Element",
  "Event",
  "EventTarget",
  "HtmlCollection",
  "HtmlElement",
  "HtmlInputElement",
  "Node",
  "Window",
];
const reservedDependencies = new Set(["js-sys", "vooya", "vooya-core", "wasm-bindgen", "web-sys"]);
const dependencyKeys = new Set([
  "branch",
  "defaultFeatures",
  "features",
  "git",
  "package",
  "path",
  "rev",
  "tag",
  "version",
]);

function mergedWebSysFeatures(features: string[] = []): string[] {
  for (const feature of features) {
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(feature)) {
      throw new Error(`Invalid web-sys feature ${JSON.stringify(feature)}.`);
    }
  }
  return [...new Set([...builtInWebSysFeatures, ...features])].sort();
}

function generatedUserDependencies(
  dependencies: Record<string, RustDependency> = {},
  applicationRoot: string,
): string {
  return Object.entries(dependencies)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, specification]) => {
      if (!/^[A-Za-z0-9_-]+$/.test(name)) {
        throw new Error(`Invalid Rust dependency name ${JSON.stringify(name)}.`);
      }
      if (reservedDependencies.has(name)) {
        throw new Error(
          `Rust dependency ${JSON.stringify(name)} is managed by Vooya and cannot be overridden.`,
        );
      }
      return `${JSON.stringify(name)} = ${generatedDependencySpecification(
        name,
        specification,
        applicationRoot,
      )}`;
    })
    .join("\n");
}

function generatedDependencySpecification(
  name: string,
  specification: RustDependency,
  root: string,
): string {
  if (typeof specification === "string") {
    if (!specification) throw new Error(`Rust dependency ${JSON.stringify(name)} must not be empty.`);
    return JSON.stringify(specification);
  }

  const unknown = Object.keys(specification).find((key) => !dependencyKeys.has(key));
  if (unknown) {
    throw new Error(
      `Rust dependency ${JSON.stringify(name)} has unsupported option ${JSON.stringify(unknown)}.`,
    );
  }
  if (!specification.version && !specification.path && !specification.git) {
    throw new Error(`Rust dependency ${JSON.stringify(name)} requires version, path, or git.`);
  }
  if (specification.path && specification.git) {
    throw new Error(`Rust dependency ${JSON.stringify(name)} cannot combine path and git.`);
  }

  const references = ["branch", "tag", "rev"].filter(
    (key) => specification[key as "branch" | "tag" | "rev"],
  );
  if (references.length > 0 && !specification.git) {
    throw new Error(
      `Rust dependency ${JSON.stringify(name)} option ${references[0]} requires git.`,
    );
  }
  if (references.length > 1) {
    throw new Error(
      `Rust dependency ${JSON.stringify(name)} can use only one of branch, tag, or rev.`,
    );
  }

  const values: string[] = [];
  for (const key of ["version", "path", "git", "branch", "tag", "rev", "package"] as const) {
    const value = specification[key];
    if (value === undefined) continue;
    if (!value) {
      throw new Error(`Rust dependency ${JSON.stringify(name)} option ${key} must be a string.`);
    }
    values.push(`${key} = ${JSON.stringify(key === "path" ? resolve(root, value) : value)}`);
  }
  if (specification.defaultFeatures !== undefined) {
    values.push(`default-features = ${specification.defaultFeatures}`);
  }
  if (specification.features !== undefined) {
    if (specification.features.some((feature) => !feature)) {
      throw new Error(
        `Rust dependency ${JSON.stringify(name)} option features must be a string array.`,
      );
    }
    values.push(
      `features = [${specification.features
        .map((feature) => JSON.stringify(feature))
        .join(", ")}]`,
    );
  }
  return `{ ${values.join(", ")} }`;
}

export function remapRustDiagnostic(
  message: CargoDiagnostic,
  mappings: Map<string, DiagnosticMapping>,
): string {
  let rendered = message.rendered ?? `${message.level ?? "error"}: ${message.message}\n`;
  for (const span of message.spans ?? []) {
    const mapping = mappings.get(resolve(span.file_name));
    if (!mapping) continue;
    const line = mapping.startLine + span.line_start - 1 - mapping.generatedLineOffset;
    rendered = rendered
      .replaceAll(
        `${span.file_name}:${span.line_start}:${span.column_start}`,
        `${mapping.id}:${line}:${span.column_start}`,
      )
      .replace(new RegExp(`(\\n\\s*)${span.line_start}(\\s+\\|)`), `$1${line}$2`);
  }
  return rendered;
}

function runCargo(
  toolchain: ResolvedToolchain,
  root: string,
  args: string[],
  mappings: Map<string, DiagnosticMapping>,
  spawn: BuildSpawn,
): MappedDiagnostic[] {
  const result = spawn(toolchain.cargo.path, [...args, "--message-format=json"], {
    cwd: root,
    encoding: "utf8",
    env: { ...toolchain.environment, CARGO_TERM_COLOR: "never" },
  });
  const diagnostics: MappedDiagnostic[] = [];
  if (result.stderr) process.stderr.write(result.stderr);
  for (const line of (result.stdout ?? "").split(/\r?\n/)) {
    if (!line) continue;
    try {
      const message = JSON.parse(line) as { reason?: string; message?: CargoDiagnostic };
      if (message.reason === "compiler-message" && message.message) {
        const mapped = remapRustDiagnostic(message.message, mappings);
        diagnostics.push(mapped);
        process.stderr.write(mapped);
      }
    } catch {
      process.stderr.write(`${line}\n`);
    }
  }
  if (result.error) {
    const detail = result.error instanceof Error ? result.error.message : String(result.error);
    throw new VooyaUserError(
      `Could not start Cargo at ${toolchain.cargo.path}: ${detail}`,
      { kind: "cargo-start", cause: result.error },
    );
  }
  const exitCode = result.status ?? -1;
  if (exitCode !== 0) {
    throw new CargoBuildError(
      `Cargo build failed with exit code ${exitCode} using cargo ${toolchain.cargo.path} and rustc ${toolchain.rustc.path}.`,
      {
        cargoPath: toolchain.cargo.path,
        rustcPath: toolchain.rustc.path,
        exitCode,
      },
    );
  }
  return diagnostics;
}

function writeIfChanged(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  try {
    if (readFileSync(path, "utf8") === content) return;
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  writeFileSync(path, content);
}
