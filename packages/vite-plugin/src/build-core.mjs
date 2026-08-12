import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { generateRustComponents, generatedComponentPrelude } from "./voo-codegen.js";

const require = createRequire(import.meta.url);

export const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));

export function resolveRuntimeCrateRoot() {
  return dirname(require.resolve("@vooya/core/rust/Cargo.toml"));
}

export function resolveRustDependencyRoots(rust = {}, applicationRoot) {
  if (!isPlainObject(rust.dependencies)) return [];
  return Object.values(rust.dependencies)
    .filter((specification) => isPlainObject(specification) && specification.path)
    .map((specification) => resolve(applicationRoot, specification.path));
}

export function buildApplication({
  applicationRoot,
  components = [],
  rust = {},
  runtimeCrateRoot = resolveRuntimeCrateRoot(),
  cacheRoot = resolve(applicationRoot, ".voo-cache"),
  outputDir = resolve(cacheRoot, "dist"),
  outputName = "vooya_app",
}) {
  const sourceDir = resolve(cacheRoot, "src/components");
  const targetDir = resolve(cacheRoot, "target");
  const sourcePaths = new Map();
  const diagnosticMappings = new Map();

  mkdirSync(sourceDir, { recursive: true });
  for (const [index, component] of components.entries()) {
    const sourcePath = resolve(sourceDir, `${index}-${component.name}.rs`);
    const prelude = generatedComponentPrelude(component);
    writeIfChanged(sourcePath, `${prelude}${component.rust.content}\n`);
    sourcePaths.set(component.id, sourcePath);
    diagnosticMappings.set(sourcePath, {
      id: component.id,
      startLine: component.rust.startLine,
      generatedLineOffset: prelude.split(/\r?\n/).length - 1,
    });
  }

  writeIfChanged(
    resolve(cacheRoot, "Cargo.toml"),
    generatedCargoManifest({ applicationRoot, runtimeCrateRoot, rust }),
  );
  writeIfChanged(
    resolve(cacheRoot, "src/lib.rs"),
    `pub use vooya_core::*;\n\n${generateRustComponents(components, sourcePaths)}`,
  );

  runCargo(
    applicationRoot,
    [
      "build",
      "--manifest-path",
      resolve(cacheRoot, "Cargo.toml"),
      "--release",
      "--target",
      "wasm32-unknown-unknown",
      "--target-dir",
      targetDir,
    ],
    diagnosticMappings,
  );

  rmSync(outputDir, { force: true, recursive: true });
  mkdirSync(outputDir, { recursive: true });
  execFileSync(
    "wasm-bindgen",
    [
      resolve(targetDir, "wasm32-unknown-unknown/release/vooya_app.wasm"),
      "--target",
      "web",
      "--out-dir",
      outputDir,
      "--out-name",
      outputName,
    ],
    { cwd: applicationRoot, stdio: "inherit" },
  );

  return {
    cacheRoot,
    runtimeModule: resolve(outputDir, `${outputName}.js`),
    wasmModule: resolve(outputDir, `${outputName}_bg.wasm`),
  };
}

// Builds the empty runtime artifact shipped by @vooya/core.
export function buildCore(root = repositoryRoot) {
  return buildApplication({
    applicationRoot: root,
    cacheRoot: resolve(root, "target/vooya-package"),
    outputDir: resolve(root, "packages/core/dist"),
  });
}

export function generatedCargoManifest({ applicationRoot, runtimeCrateRoot, rust = {} }) {
  const webSysFeatures = mergedWebSysFeatures(rust.webSysFeatures);
  const dependencies = generatedUserDependencies(rust.dependencies, applicationRoot);
  return `[package]
name = "vooya-app"
version = "0.0.0"
edition = "2024"

[workspace]

[lib]
crate-type = ["cdylib"]

[dependencies]
vooya-core = { path = ${JSON.stringify(runtimeCrateRoot)} }
js-sys = "=0.3.92"
wasm-bindgen = "=0.2.115"
web-sys = { version = "=0.3.92", features = [
${webSysFeatures.map((feature) => `  ${JSON.stringify(feature)},`).join("\n")}
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

const reservedDependencies = new Set(["js-sys", "vooya-core", "wasm-bindgen", "web-sys"]);
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

function mergedWebSysFeatures(features = []) {
  if (!Array.isArray(features)) throw new Error("Vooya rust.webSysFeatures must be an array.");
  for (const feature of features) {
    if (typeof feature !== "string" || !/^[A-Za-z][A-Za-z0-9]*$/.test(feature)) {
      throw new Error(`Invalid web-sys feature ${JSON.stringify(feature)}.`);
    }
  }
  return [...new Set([...builtInWebSysFeatures, ...features])].sort();
}

function generatedUserDependencies(dependencies = {}, applicationRoot) {
  if (!isPlainObject(dependencies)) {
    throw new Error("Vooya rust.dependencies must be an object.");
  }
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

function generatedDependencySpecification(name, specification, applicationRoot) {
  if (typeof specification === "string" && specification) {
    return JSON.stringify(specification);
  }
  if (!isPlainObject(specification)) {
    throw new Error(`Rust dependency ${JSON.stringify(name)} must be a version or an object.`);
  }
  const unknown = Object.keys(specification).filter((key) => !dependencyKeys.has(key));
  if (unknown.length > 0) {
    throw new Error(
      `Rust dependency ${JSON.stringify(name)} has unsupported option ${JSON.stringify(unknown[0])}.`,
    );
  }
  if (!specification.version && !specification.path && !specification.git) {
    throw new Error(
      `Rust dependency ${JSON.stringify(name)} requires version, path, or git.`,
    );
  }
  if (specification.path && specification.git) {
    throw new Error(`Rust dependency ${JSON.stringify(name)} cannot combine path and git.`);
  }
  const gitReferences = ["branch", "tag", "rev"].filter((key) => specification[key]);
  if (gitReferences.length > 0 && !specification.git) {
    throw new Error(
      `Rust dependency ${JSON.stringify(name)} option ${gitReferences[0]} requires git.`,
    );
  }
  if (gitReferences.length > 1) {
    throw new Error(
      `Rust dependency ${JSON.stringify(name)} can use only one of branch, tag, or rev.`,
    );
  }

  const values = [];
  for (const key of ["version", "path", "git", "branch", "tag", "rev", "package"]) {
    const value = specification[key];
    if (value === undefined) continue;
    if (typeof value !== "string" || !value) {
      throw new Error(`Rust dependency ${JSON.stringify(name)} option ${key} must be a string.`);
    }
    const rendered = key === "path" ? resolve(applicationRoot, value) : value;
    values.push(`${key} = ${JSON.stringify(rendered)}`);
  }
  if (specification.defaultFeatures !== undefined) {
    if (typeof specification.defaultFeatures !== "boolean") {
      throw new Error(
        `Rust dependency ${JSON.stringify(name)} option defaultFeatures must be a boolean.`,
      );
    }
    values.push(`default-features = ${specification.defaultFeatures}`);
  }
  if (specification.features !== undefined) {
    if (
      !Array.isArray(specification.features) ||
      specification.features.some((feature) => typeof feature !== "string" || !feature)
    ) {
      throw new Error(
        `Rust dependency ${JSON.stringify(name)} option features must be a string array.`,
      );
    }
    values.push(
      `features = [${specification.features.map((feature) => JSON.stringify(feature)).join(", ")}]`,
    );
  }
  return `{ ${values.join(", ")} }`;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function remapRustDiagnostic(message, mappings) {
  let rendered = message.rendered ?? `${message.level}: ${message.message}\n`;
  for (const span of message.spans ?? []) {
    const sourcePath = resolve(span.file_name);
    const mapping = mappings.get(sourcePath);
    if (!mapping) continue;
    const sourceLine =
      mapping.startLine + span.line_start - 1 - (mapping.generatedLineOffset ?? 0);
    rendered = rendered.replaceAll(
      `${span.file_name}:${span.line_start}:${span.column_start}`,
      `${mapping.id}:${sourceLine}:${span.column_start}`,
    );
    rendered = rendered.replace(
      new RegExp(`(\\n\\s*)${span.line_start}(\\s+\\|)`),
      `$1${sourceLine}$2`,
    );
  }
  return rendered;
}

function runCargo(root, args, mappings) {
  const result = spawnSync("cargo", [...args, "--message-format=json"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, CARGO_TERM_COLOR: "never" },
  });

  if (result.stderr) process.stderr.write(result.stderr);
  for (const line of result.stdout.split(/\r?\n/)) {
    if (!line) continue;
    try {
      const message = JSON.parse(line);
      if (message.reason === "compiler-message") {
        process.stderr.write(remapRustDiagnostic(message.message, mappings));
      }
    } catch {
      process.stderr.write(`${line}\n`);
    }
  }
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Cargo build failed with exit code ${result.status}.`);
}

function writeIfChanged(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  try {
    if (readFileSync(path, "utf8") === content) return;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  writeFileSync(path, content);
}
