// The build core accepts user-owned Vite/Rust configuration whose shape is
// intentionally open-ended. Keep that boundary untyped while the emitted
// public JavaScript surface is migrated to TypeScript source.
// @ts-nocheck
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  generateVooDeclaration,
  generatedAdapterDefinition,
  generatedComponentBinding,
  parseVooComponent,
} from "@vooya/compiler";
import { buildApplication as buildSharedApplication } from "@vooya/build-core";

export const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));

// Builds the empty runtime artifact shipped by @vooya/core.
export function buildCore(root = repositoryRoot) {
  return buildSharedApplication({
    applicationRoot: root,
    workspaceRoot: resolve(root, "target/vooya-package"),
    outputDir: resolve(root, "packages/core/dist"),
  });
}

// Compatibility subpath: Cargo and wasm-bindgen execution lives only in the
// bundler-neutral package, including for artifact production.
export {
  buildApplication,
  generatedCargoManifest,
  remapRustDiagnostic,
  resolveRuntimeCrateRoot,
  resolveRustDependencyRoots,
} from "@vooya/build-core";

/**
 * Builds one Vue component source file into the distributable contents of one
 * explicit artifact package. It deliberately has no package discovery or
 * registry behavior: callers name their package root and component source.
 */
export function buildPrecompiledVueArtifact({ packageRoot, source, outputDir } = {}) {
  const root = resolveArtifactPackageRoot(packageRoot);
  const metadata = readArtifactPackageMetadata(root);
  const sourcePath = resolveArtifactSource(root, source);
  const distribution = resolveArtifactOutput(root, outputDir);
  if (metadata.dependencies?.["@vooya/vue"] !== metadata.version) {
    throw new Error(`${metadata.name} must depend on @vooya/vue at its exact package version.`);
  }

  const component = parseVooComponent(readFileSync(sourcePath, "utf8"), sourcePath);
  if (component.format !== "source") {
    throw new Error(`Vooya precompiled Vue artifacts require source .voo input, received ${component.format}.`);
  }
  component.id = sourcePath;
  const definition = generatedAdapterDefinition(component);
  const binding = generatedComponentBinding(component);
  const manifest = {
    formatVersion: 1,
    artifactVersion: metadata.version,
    framework: "vue",
    component: component.name,
    abiVersion: definition.abiVersion,
    bindings: {
      mount: binding.exportName,
      dispose: binding.disposeName,
      updates: binding.updateNames,
    },
    wasm: "./wasm/vooya_app_bg.wasm",
    types: "./index.d.ts",
  };

  rmSync(distribution, { force: true, recursive: true });
  mkdirSync(distribution, { recursive: true });
  buildSharedApplication({
    applicationRoot: root,
    components: [component],
    workspaceRoot: resolve(root, ".artifact-build"),
    outputDir: resolve(distribution, "wasm"),
    rust: { webSysFeatures: ["Node", "NodeList"] },
    framework: "vue",
  });
  writeFileSync(resolve(distribution, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(resolve(distribution, "index.js"), generatePrecompiledVueEntry({ manifest, definition, binding }));
  writeFileSync(resolve(distribution, "index.d.ts"), generatePrecompiledVueDeclaration(component, manifest));
  assertArtifactOutput(distribution);
  return manifest;
}

function resolveArtifactPackageRoot(packageRoot) {
  if (typeof packageRoot !== "string" || !packageRoot) {
    throw new Error("Vooya precompiled Vue artifacts require an explicit packageRoot directory.");
  }
  const root = resolve(packageRoot);
  try {
    if (!statSync(root).isDirectory()) throw new Error("not a directory");
  } catch {
    throw new Error(`Vooya precompiled Vue artifact packageRoot must be an existing directory: ${root}.`);
  }
  return root;
}

function readArtifactPackageMetadata(packageRoot) {
  const packageJson = resolve(packageRoot, "package.json");
  if (!existsSync(packageJson)) {
    throw new Error(`Vooya precompiled Vue artifact packageRoot is missing package.json: ${packageRoot}.`);
  }
  const metadata = JSON.parse(readFileSync(packageJson, "utf8"));
  if (typeof metadata.name !== "string" || !metadata.name.trim()) {
    throw new Error("Vooya precompiled Vue artifact package.json must declare a package name.");
  }
  if (typeof metadata.version !== "string" || !isSemverVersion(metadata.version)) {
    throw new Error(`${metadata.name} must declare a valid package version.`);
  }
  return metadata;
}

function resolveArtifactSource(packageRoot, source) {
  if (typeof source !== "string" || !source.endsWith(".voo")) {
    throw new Error("Vooya precompiled Vue artifacts require an explicit source .voo file.");
  }
  const sourcePath = resolve(source);
  if (!isPathInside(sourcePath, packageRoot)) {
    throw new Error("Vooya precompiled Vue artifact source must stay inside packageRoot.");
  }
  try {
    if (!statSync(sourcePath).isFile()) throw new Error("not a file");
  } catch {
    throw new Error(`Vooya precompiled Vue artifact source must be an existing file: ${sourcePath}.`);
  }
  return sourcePath;
}

function resolveArtifactOutput(packageRoot, outputDir) {
  const expected = resolve(packageRoot, "dist");
  const output = resolve(outputDir ?? expected);
  if (output !== expected) {
    throw new Error(`Vooya precompiled Vue artifact output must be packageRoot/dist: ${expected}.`);
  }
  return output;
}

function assertArtifactOutput(outputDir) {
  const expected = ["manifest.json", "index.js", "index.d.ts", "wasm/vooya_app.js", "wasm/vooya_app_bg.wasm"];
  for (const file of expected) {
    if (!existsSync(resolve(outputDir, file))) {
      throw new Error(`Vooya precompiled Vue artifact build did not produce expected output ${file}.`);
    }
  }
}

function isSemverVersion(version) {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(version);
}

function isPathInside(path, directory) {
  const relativePath = relative(directory, path);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function generatePrecompiledVueEntry({ manifest, definition, binding }) {
  const imports = [binding.exportName, binding.disposeName, ...Object.values(binding.updateNames), "voo_abi_version"];
  const updates = Object.entries(binding.updateNames)
    .map(([prop, name]) => `update_${prop}(value) { ${name}(handle, value); }`)
    .join(", ");
  return `// Generated by @vooya/vite/build. Do not edit.
import init, { ${imports.join(", ")} } from "./wasm/vooya_app.js";
import { defineVooyaComponent } from "@vooya/vue";

export const manifest = ${JSON.stringify(manifest, null, 2)};
const definition = ${JSON.stringify(definition, null, 2)};
let bindings;

export function assertArtifactAbi(actual) {
  if (actual !== manifest.abiVersion) {
    throw new Error(\`Vooya artifact ABI mismatch for \${manifest.component}: artifact expects \${manifest.abiVersion}, but WASM provides \${String(actual)}.\`);
  }
}

async function loadBindings() {
  if (!bindings) {
    bindings = Promise.resolve(init()).then(() => {
      assertArtifactAbi(voo_abi_version());
      return {
        mount(host, ...props) {
          const handle = ${binding.exportName}(host, ...props);
          return { dispose() { ${binding.disposeName}(handle); }, ${updates} };
        },
      };
    });
  }
  return bindings;
}

export default defineVooyaComponent({ contract: definition, loadBindings });
`;
}

function generatePrecompiledVueDeclaration(component, manifest) {
  const declaration = generateVooDeclaration(component, "vue").replace(
    "// Generated by @vooya/vite. Do not edit.",
    "// Generated by @vooya/vite/build. Do not edit.",
  );
  return `${declaration}
export interface VooyaArtifactManifest {
  formatVersion: 1;
  artifactVersion: string;
  framework: "vue";
  component: ${JSON.stringify(manifest.component)};
  abiVersion: number;
  bindings: { mount: string; dispose: string; updates: Record<string, string> };
  wasm: string;
  types: string;
}

export const manifest: VooyaArtifactManifest;
export function assertArtifactAbi(actual: number): void;
`;
}
