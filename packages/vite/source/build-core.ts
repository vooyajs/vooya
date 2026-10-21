import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { compileComponentStyle, VOO_ABI_VERSION } from "@vooya/compiler";
import { parse, satisfies, valid, validRange } from "semver";
import {
  buildApplication as buildSharedApplication,
  buildRustComponentContracts,
  indexVooyaSchema,
  generateRustSchemaDeclaration,
  renderRustComponentModule,
  resolveRustSchemaGroup,
} from "@vooya/build-core";

export const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));

export function buildCore(root = repositoryRoot) {
  return buildSharedApplication({
    applicationRoot: root,
    workspaceRoot: resolve(root, "target/vooya-package"),
    outputDir: resolve(root, "packages/core/dist"),
  });
}

export {
  buildApplication,
  generatedCargoManifest,
  remapRustDiagnostic,
  resolveRuntimeCrateRoot,
  resolveRustDependencyRoots,
} from "@vooya/build-core";

interface VueAdapterCompatibility {
  package: "@vooya/vue";
  version: string;
  range: string;
}

interface PrecompiledVueArtifactManifest {
  formatVersion: 1;
  artifactVersion: string;
  framework: "vue";
  component: string;
  abiVersion: number;
  adapter: VueAdapterCompatibility;
  bindings: {
    mount: string;
    dispose: string;
    updates: Record<string, string>;
  };
  loader: string;
  wasm: string;
  types: string;
  stylesheet?: string;
}

/** Build an explicitly named Rust component into a self-contained Vue artifact. */
export function buildPrecompiledVueArtifact({
  packageRoot,
  source,
  outputDir,
}: {
  packageRoot?: string;
  source?: string;
  outputDir?: string;
} = {}) {
  const root = resolveArtifactPackageRoot(packageRoot);
  const metadata = readArtifactPackageMetadata(root);
  const sourcePath = resolveArtifactSource(root, source);
  const distribution = resolveArtifactOutput(root, outputDir);
  const adapterRange = resolveVueAdapterRange(metadata);
  const adapterVersion = resolveVueAdapterVersion(root);
  if (!satisfies(adapterVersion, adapterRange)) {
    throw new Error(
      `${metadata.name} declares @vooya/vue "${adapterRange}", but this artifact is generated against `
      + `@vooya/vue ${adapterVersion}; the declared range must include the generated adapter version.`,
    );
  }
  rmSync(distribution, { recursive: true, force: true });
  mkdirSync(distribution, { recursive: true });
  const result = buildSharedApplication({
    applicationRoot: root,
    workspaceRoot: resolve(root, ".artifact-build"),
    outputDir: resolve(distribution, "wasm"),
    rust: {
      sourceRoot: relative(root, dirname(sourcePath)),
      webSysFeatures: ["Node", "NodeList"],
    },
    framework: "vue",
  });
  const index = indexVooyaSchema(result.schema);
  const contracts = buildRustComponentContracts(index).filter((contract) =>
    contract.component.group && resolveRustSchemaGroup(root, contract.component.group) === sourcePath,
  );
  if (contracts.length !== 1) {
    throw new Error(`Vooya Vue artifacts require exactly one Rust component in ${sourcePath}.`);
  }
  const contract = contracts[0];
  // Match snake_case_ident in vooya-macros, including consecutive capitals.
  const stem = contract.component.name
    .replace(/[A-Z]/g, (character, index) => `${index > 0 ? "_" : ""}${character.toLowerCase()}`)
    .replace(/[^a-z0-9_]/gu, "_") || "store";
  const styles = contract.component.styles ?? [];
  let styleModule: string | undefined;
  if (styles.length) {
    const content = styles
      .map((style) => readFileSync(resolve(dirname(sourcePath), style.path), "utf8"))
      .join("\n");
    writeFileSync(resolve(distribution, "component.css"), compileComponentStyle({
      id: sourcePath,
      name: contract.component.name,
      style: { content, scoped: styles.some((style) => style.scoped) },
    }));
    styleModule = "./component.css";
  }
  const manifest: PrecompiledVueArtifactManifest = {
    formatVersion: 1,
    artifactVersion: metadata.version,
    framework: "vue",
    component: contract.component.name,
    abiVersion: VOO_ABI_VERSION,
    adapter: {
      package: "@vooya/vue",
      version: adapterVersion,
      range: adapterRange,
    },
    bindings: {
      mount: `voo_${stem}_mount`,
      dispose: `voo_${stem}_dispose`,
      updates: { props: `voo_${stem}_update_props` },
    },
    loader: "./wasm/vooya_app.js",
    wasm: "./wasm/vooya_app_bg.wasm",
    types: "./index.d.ts",
    ...(styleModule ? { stylesheet: styleModule } : {}),
  };
  // Ship the same retryable initialization helper without a compiler or plugin dependency.
  const runtime = readFileSync(new URL("./runtime.js", import.meta.url), "utf8")
    .replace(/^export \{ VOO_ABI_VERSION \} from .*;\r?\n/m, "")
    .replace(/^import \{ VOO_ABI_VERSION \} from .*;\r?\n/m, `const VOO_ABI_VERSION = ${VOO_ABI_VERSION};\n`);
  writeFileSync(resolve(distribution, "runtime.js"), runtime);
  const entry = renderRustComponentModule(contract, "vue", sourcePath, {
    runtimeModule: manifest.loader,
    runtimeHelpers: "./runtime.js",
    styleModule: manifest.stylesheet,
  });
  writeFileSync(resolve(distribution, "index.js"), entry + `
export const manifest = ${JSON.stringify(manifest, null, 2)};
export function assertArtifactAbi(actual) {
  if (actual !== manifest.abiVersion) throw new Error(\`Vooya artifact ABI mismatch for \${manifest.component}: artifact expects \${manifest.abiVersion}, but WASM provides \${String(actual)}.\`);
}
`);
  const declaration = generateRustSchemaDeclaration({ contract, framework: "vue", types: index.types });
  writeFileSync(resolve(distribution, "index.d.ts"), declaration + `
export interface VooyaArtifactManifest {
  formatVersion: 1;
  artifactVersion: string;
  framework: "vue";
  component: ${JSON.stringify(manifest.component)};
  abiVersion: number;
  adapter: {
    package: "@vooya/vue";
    version: string;
    range: string;
  };
  bindings: {
    mount: string;
    dispose: string;
    updates: Record<string, string>;
  };
  loader: string;
  wasm: string;
  types: string;
  stylesheet?: string;
}
export const manifest: VooyaArtifactManifest;
export function assertArtifactAbi(actual: number): void;
`);
  writeFileSync(resolve(distribution, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  validatePrecompiledVueArtifactOutput(distribution);
  return manifest;
}

function resolveArtifactPackageRoot(packageRoot: unknown) {
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

function readArtifactPackageMetadata(packageRoot: string) {
  const packageJson = resolve(packageRoot, "package.json");
  if (!existsSync(packageJson)) {
    throw new Error(`Vooya precompiled Vue artifact packageRoot is missing package.json: ${packageRoot}.`);
  }
  const metadata: unknown = JSON.parse(readFileSync(packageJson, "utf8"));
  if (!metadata || typeof metadata !== "object") {
    throw new Error("Vooya precompiled Vue artifact package.json must declare a package name.");
  }
  if (!("name" in metadata) || typeof metadata.name !== "string" || !metadata.name.trim()) {
    throw new Error("Vooya precompiled Vue artifact package.json must declare a package name.");
  }
  if (!("version" in metadata) || typeof metadata.version !== "string") {
    throw new Error(`${metadata.name} must declare a valid package version.`);
  }
  const version = normalizeSemverVersion(metadata.version);
  if (version === undefined) {
    throw new Error(`${metadata.name} must declare a valid package version.`);
  }
  const dependencies = "dependencies" in metadata && metadata.dependencies && typeof metadata.dependencies === "object"
    ? metadata.dependencies as Record<string, unknown>
    : undefined;
  return { name: metadata.name, version, dependencies };
}

function normalizeSemverVersion(value: string) {
  const parsed = parse(value);
  if (!parsed) return undefined;
  return `${parsed.version}${parsed.build.length ? `+${parsed.build.join(".")}` : ""}`;
}

function resolveVueAdapterRange(metadata: { name: string; dependencies?: Record<string, unknown> }) {
  const range = metadata.dependencies?.["@vooya/vue"];
  if (typeof range !== "string" || !range.trim()) {
    throw new Error(`${metadata.name} must declare a @vooya/vue runtime dependency for its Vue artifact adapter.`);
  }
  if (validRange(range) === null) {
    throw new Error(
      `${metadata.name} declares an unsupported @vooya/vue dependency "${range}"; use a semver version or range.`,
    );
  }
  return range;
}

function resolveVueAdapterVersion(packageRoot: string) {
  for (const location of [resolve(packageRoot, "package.json"), import.meta.url]) {
    const version = resolveInstalledPackageVersion("@vooya/vue", location);
    if (version) return version;
  }
  const repositoryCandidate = resolve(repositoryRoot, "packages/vue/package.json");
  if (existsSync(repositoryCandidate)) {
    const metadata: unknown = JSON.parse(readFileSync(repositoryCandidate, "utf8"));
    if (metadata && typeof metadata === "object" && "version" in metadata && typeof metadata.version === "string") {
      const version = normalizeSemverVersion(metadata.version);
      if (version) return version;
    }
  }
  throw new Error(
    "Unable to resolve the @vooya/vue adapter version needed to build a precompiled Vue artifact; install @vooya/vue before building.",
  );
}

function resolveInstalledPackageVersion(packageName: string, location: string) {
  const target = location.startsWith("file:") ? fileURLToPath(location) : location;
  let directory = dirname(target);
  try {
    if (statSync(target).isDirectory()) directory = target;
  } catch {
    // The caller's file may not exist yet; start from its containing directory.
  }
  while (true) {
    const packageJson = resolve(directory, "node_modules", ...packageName.split("/"), "package.json");
    if (existsSync(packageJson)) {
      const metadata: unknown = JSON.parse(readFileSync(packageJson, "utf8"));
      if (metadata && typeof metadata === "object" && "name" in metadata && metadata.name === packageName) {
        if (!("version" in metadata) || typeof metadata.version !== "string") {
          throw new Error(`Installed ${packageName} at ${packageJson} does not declare a valid semver version.`);
        }
        const version = normalizeSemverVersion(metadata.version);
        if (version === undefined) {
          throw new Error(`Installed ${packageName} at ${packageJson} does not declare a valid semver version.`);
        }
        return version;
      }
    }
    const parent = dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

function resolveArtifactSource(packageRoot: string, source: unknown) {
  if (typeof source !== "string" || !source.endsWith(".rs")) {
    throw new Error("Vooya precompiled Vue artifacts require an explicit source .rs file.");
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

function resolveArtifactOutput(packageRoot: string, outputDir?: string) {
  const expected = resolve(packageRoot, "dist");
  const output = resolve(outputDir ?? expected);
  if (output !== expected) {
    throw new Error(`Vooya precompiled Vue artifact output must be packageRoot/dist: ${expected}.`);
  }
  return output;
}

export function validatePrecompiledVueArtifactOutput(outputDir: string) {
  const required = ["manifest.json", "index.js", "index.d.ts", "runtime.js"];
  for (const file of required) {
    if (!existsSync(resolve(outputDir, file))) {
      throw new Error(`Vooya precompiled Vue artifact build did not produce expected output ${file}.`);
    }
  }
  const manifest: unknown = JSON.parse(readFileSync(resolve(outputDir, "manifest.json"), "utf8"));
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("Vooya precompiled Vue artifact manifest must be an object.");
  }
  const record = manifest as Record<string, unknown>;
  validateArtifactIdentity(record);
  const component = record.component as string;
  const loader = validateArtifactAssetPath(outputDir, "loader", record.loader);
  validateArtifactAssetPath(outputDir, "wasm", record.wasm);
  validateArtifactAssetPath(outputDir, "types", record.types);
  if ("stylesheet" in record) validateArtifactAssetPath(outputDir, "stylesheet", record.stylesheet);
  validateArtifactAdapter(record.adapter, component);
  const bindings = validateArtifactBindings(record.bindings, component);
  for (const file of artifactFiles(outputDir)) {
    if (file.includes(".vooya") || file.includes(".artifact-build") || file.endsWith(".rs") || file.endsWith("Cargo.toml")) {
      throw new Error(`Vooya precompiled Vue artifact must not include build input ${file}.`);
    }
    const content = readFileSync(resolve(outputDir, file));
    if (content.includes(Buffer.from(outputDir))) {
      throw new Error(`Vooya precompiled Vue artifact must not include an absolute output path in ${file}.`);
    }
  }
  const loaderSource = readFileSync(loader, "utf8");
  const loaderExports = javaScriptExports(loaderSource);
  validateArtifactWasm(outputDir, loader, loaderSource, record, component);
  const advertised: Array<[string, string]> = [
    ["mount", bindings.mount],
    ["dispose", bindings.dispose],
    ...Object.entries(bindings.updates).map(([name, binding]): [string, string] => [`update "${name}"`, binding]),
  ];
  for (const [role, binding] of advertised) {
    if (!loaderExports.has(binding)) {
      throw new Error(
        `Vooya precompiled Vue artifact component "${component}" binding "${role}" advertises "${binding}", `
        + `but ${record.loader as string} does not export it. Available exports: ${[...loaderExports].sort().join(", ")}.`,
      );
    }
  }
  if (!loaderExports.has("voo_abi_version")) {
    throw new Error(
      `Vooya precompiled Vue artifact loader ${record.loader as string} must export voo_abi_version for component "${component}".`,
    );
  }
  validateArtifactEntry(outputDir, record, bindings, component);
}

function validateArtifactIdentity(manifest: Record<string, unknown>) {
  if (manifest.formatVersion !== 1) throw new Error("Vooya precompiled Vue artifact manifest formatVersion must be 1.");
  if (manifest.framework !== "vue") throw new Error("Vooya precompiled Vue artifact manifest framework must be \"vue\".");
  if (typeof manifest.component !== "string" || !manifest.component.trim()) {
    throw new Error("Vooya precompiled Vue artifact manifest component must be a non-empty string.");
  }
  if (typeof manifest.artifactVersion !== "string" || valid(manifest.artifactVersion) === null) {
    throw new Error("Vooya precompiled Vue artifact manifest artifactVersion must be a semver version.");
  }
  if (typeof manifest.abiVersion !== "number") {
    throw new Error("Vooya precompiled Vue artifact manifest abiVersion must be a number.");
  }
}

function validateArtifactAssetPath(outputDir: string, name: string, path: unknown) {
  if (typeof path !== "string" || !path.startsWith("./") || !isArtifactRelativePath(path)) {
    throw new Error(`Vooya precompiled Vue artifact manifest ${name} must be a package-relative path.`);
  }
  const asset = resolve(outputDir, path);
  if (!isPathInside(asset, outputDir) || !isFile(asset)) {
    throw new Error(`Vooya precompiled Vue artifact manifest ${name} must reference a file in dist: ${path}.`);
  }
  return asset;
}

function validateArtifactAdapter(adapter: unknown, component: string) {
  if (!adapter || typeof adapter !== "object" || Array.isArray(adapter)) {
    throw new Error(`Vooya precompiled Vue artifact component "${component}" must declare its @vooya/vue adapter compatibility.`);
  }
  const { package: packageName, version, range } = adapter as Record<string, unknown>;
  if (packageName !== "@vooya/vue") {
    throw new Error(`Vooya precompiled Vue artifact component "${component}" adapter package must be "@vooya/vue".`);
  }
  if (typeof version !== "string" || valid(version) === null) {
    throw new Error(`Vooya precompiled Vue artifact component "${component}" adapter version must be an exact semver version.`);
  }
  if (typeof range !== "string" || validRange(range) === null) {
    throw new Error(`Vooya precompiled Vue artifact component "${component}" adapter range must be a valid semver range.`);
  }
  if (!satisfies(version, range)) {
    throw new Error(
      `Vooya precompiled Vue artifact component "${component}" adapter version ${version} `
      + `is outside its declared @vooya/vue range ${range}.`,
    );
  }
}

function validateArtifactBindings(value: unknown, component: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Vooya precompiled Vue artifact component "${component}" must declare mount, dispose and update bindings.`);
  }
  const record = value as Record<string, unknown>;
  const updates = record.updates && typeof record.updates === "object" && !Array.isArray(record.updates)
    ? Object.fromEntries(Object.entries(record.updates).map(([name, binding]) => {
      if (typeof binding !== "string" || !bindingIdentifier(binding)) {
        throw new Error(`Vooya precompiled Vue artifact component "${component}" update binding "${name}" must be a JavaScript identifier.`);
      }
      return [name, binding];
    }))
    : undefined;
  if (!updates) {
    throw new Error(`Vooya precompiled Vue artifact component "${component}" must declare update bindings.`);
  }
  return {
    mount: bindingName(record.mount, "mount", component),
    dispose: bindingName(record.dispose, "dispose", component),
    updates,
  };
}

function bindingName(value: unknown, role: string, component: string) {
  if (typeof value !== "string" || !bindingIdentifier(value)) {
    throw new Error(`Vooya precompiled Vue artifact component "${component}" binding "${role}" must be a JavaScript identifier.`);
  }
  return value;
}

function bindingIdentifier(value: string) {
  return /^[A-Za-z_$][\w$]*$/.test(value);
}

// wasm-bindgen --target web owns its glue-module URL. Cross-check that URL
// instead of duplicating loader generation in the artifact builder.
function validateArtifactWasm(
  outputDir: string,
  loader: string,
  loaderSource: string,
  manifest: Record<string, unknown>,
  component: string,
) {
  const match = loaderSource.match(/new URL\(\s*["']([^"']+\.wasm)["']\s*,\s*import\.meta\.url\s*\)/);
  if (!match) {
    throw new Error(
      `Vooya precompiled Vue artifact component "${component}" loader ${String(manifest.loader)} `
      + "must reference its WASM binary with new URL(..., import.meta.url).",
    );
  }
  const loaderWasm = resolve(dirname(loader), match[1]);
  if (!isPathInside(loaderWasm, outputDir) || !isFile(loaderWasm)) {
    throw new Error(
      `Vooya precompiled Vue artifact component "${component}" loader ${String(manifest.loader)} `
      + `references a WASM file outside dist: ${match[1]}.`,
    );
  }
  const manifestWasm = resolve(outputDir, String(manifest.wasm));
  if (loaderWasm !== manifestWasm) {
    throw new Error(
      `Vooya precompiled Vue artifact component "${component}" loader references WASM "${relative(outputDir, loaderWasm)}", `
      + `but the manifest declares wasm "${String(manifest.wasm)}".`,
    );
  }
}

function validateArtifactEntry(
  outputDir: string,
  manifest: Record<string, unknown>,
  bindings: { mount: string; dispose: string; updates: Record<string, string> },
  component: string,
) {
  const source = readFileSync(resolve(outputDir, "index.js"), "utf8");
  validateEmbeddedManifest(source, manifest, component);
  const match = source.match(/import\s+init\s*,\s*\{([^}]*)\}\s*from\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*');/);
  if (!match) {
    throw new Error(`Vooya precompiled Vue artifact component "${component}" index.js must import its loader bindings.`);
  }
  const specifier = match[2].slice(1, -1);
  if (specifier !== manifest.loader) {
    throw new Error(
      `Vooya precompiled Vue artifact component "${component}" index.js imports loader "${specifier}", `
      + `but the manifest declares "${String(manifest.loader)}".`,
    );
  }
  const imported = match[1].split(",").map((name) => name.trim().split(/\s+as\s+/).at(-1) ?? "").filter(Boolean).sort();
  const advertised = [bindings.mount, bindings.dispose, ...Object.values(bindings.updates), "voo_abi_version"].sort();
  if (new Set(imported).size !== new Set(advertised).size || imported.some((name, index) => name !== advertised[index])) {
    throw new Error(
      `Vooya precompiled Vue artifact component "${component}" index.js imports [${imported.join(", ")}], `
      + `but the manifest advertises [${advertised.join(", ")}].`,
    );
  }
  if (typeof manifest.stylesheet === "string" && !source.includes(`import ${JSON.stringify(manifest.stylesheet)};`)) {
    throw new Error(
      `Vooya precompiled Vue artifact component "${component}" index.js must import declared stylesheet "${manifest.stylesheet}".`,
    );
  }
}

function validateEmbeddedManifest(source: string, manifest: Record<string, unknown>, component: string) {
  // This mirrors renderRustComponentModule's generated entry format. Keep the
  // marker in sync if the entry generator changes its manifest export layout.
  const match = source.match(/export const manifest = (\{[\s\S]*?\});\nexport function assertArtifactAbi/);
  if (!match) {
    throw new Error(`Vooya precompiled Vue artifact component "${component}" index.js must embed its manifest.`);
  }
  let embedded: unknown;
  try {
    embedded = JSON.parse(match[1]);
  } catch (cause) {
    throw new Error(`Vooya precompiled Vue artifact component "${component}" index.js embeds an invalid manifest.`, { cause });
  }
  if (!isDeepStrictEqual(embedded, manifest)) {
    throw new Error(`Vooya precompiled Vue artifact component "${component}" index.js embedded manifest does not match manifest.json.`);
  }
}

function javaScriptExports(source: string) {
  const exports = new Set<string>();
  for (const match of source.matchAll(/export\s*\{([^}]*)\}\s*;?/g)) {
    for (const item of match[1].split(",")) {
      const name = item.trim().split(/\s+as\s+/).at(-1)?.trim();
      if (name && name !== "default" && bindingIdentifier(name)) exports.add(name);
    }
  }
  for (const match of source.matchAll(/export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) {
    exports.add(match[1]);
  }
  return exports;
}

function isFile(path: string) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function artifactFiles(directory: string, prefix = ""): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${prefix}${entry.name}`;
    return entry.isDirectory() ? artifactFiles(resolve(directory, entry.name), `${path}/`) : [path];
  });
}

function isArtifactRelativePath(path: string) {
  return !path.includes("\\") && !path.split("/").includes("..") && !isAbsolute(path);
}

function isPathInside(path: string, directory: string) {
  const relativePath = relative(directory, path);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}
