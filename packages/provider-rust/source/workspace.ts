import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  rmdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, parse, posix, relative, resolve } from "node:path";

import { generateRustSchemaDeclaration, generateRustStoreDeclaration } from "./schema-declarations.js";
import type { RustComponentContract } from "./schema.js";
import type { RustStoreSchema } from "./schema.js";
import type { RustTypeSchema } from "./schema.js";

export const VOOYA_WORKSPACE_SCHEMA_VERSION = 1;

export interface VooyaWorkspacePaths {
  root: string;
  build: string;
  wasm: string;
  types: string;
  cache: string;
  metadata: string;
}

export interface VooyaWorkspaceMetadata {
  product: "vooya";
  schemaVersion: number;
  abiVersions?: number[];
  toolchain?: {
    cargo: string;
    rustc: string;
    target: string;
    wasmBindgen: string;
  };
}


export interface WrittenRustDeclarations {
  typesRoot: string;
  files: string[];
}

export interface RustDeclarationArtifact {
  contracts: RustComponentContract[];
  stores?: RustStoreSchema[];
  types?: RustTypeSchema[];
}

export interface WriteRustSchemaDeclarationsOptions {
  applicationRoot: string;
  contracts: RustComponentContract[];
  stores?: RustStoreSchema[];
  types?: RustTypeSchema[];
  /** Separate type graphs for independently compiled artifacts. */
  artifacts?: RustDeclarationArtifact[];
  framework: "vue" | "react" | "solid" | "svelte" | "octane";
  workspaceRoot?: string;
}

export function resolveVooyaWorkspace(
  applicationRoot: string,
  workspaceRoot?: string,
): VooyaWorkspacePaths {
  const application = resolve(applicationRoot);
  const root = resolve(application, workspaceRoot ?? ".vooya");
  if (root === application || root === parse(root).root) {
    throw new Error(
      `Vooya workspace root must be a dedicated directory, received ${root}.`,
    );
  }
  return {
    root,
    build: resolve(root, "build"),
    wasm: resolve(root, "wasm"),
    types: resolve(root, "types"),
    cache: resolve(root, "cache"),
    metadata: resolve(root, "metadata.json"),
  };
}

export function ensureVooyaWorkspace(paths: VooyaWorkspacePaths): void {
  const previous = readWorkspaceMetadata(paths);
  if (
    previous &&
    (previous.product !== "vooya" ||
      previous.schemaVersion !== VOOYA_WORKSPACE_SCHEMA_VERSION)
  ) {
    removeGeneratedEntries(paths);
  }
  for (const directory of [
    paths.root,
    paths.build,
    paths.wasm,
    paths.types,
    paths.cache,
  ]) {
    mkdirSync(directory, { recursive: true });
  }
  writeWorkspaceMetadata(paths, {});
}

export function writeWorkspaceMetadata(
  paths: VooyaWorkspacePaths,
  metadata: Omit<VooyaWorkspaceMetadata, "product" | "schemaVersion">,
): void {
  mkdirSync(paths.root, { recursive: true });
  const current = readWorkspaceMetadata(paths);
  const value: VooyaWorkspaceMetadata = {
    product: "vooya",
    schemaVersion: VOOYA_WORKSPACE_SCHEMA_VERSION,
    ...(current?.product === "vooya" &&
    current.schemaVersion === VOOYA_WORKSPACE_SCHEMA_VERSION
      ? current
      : {}),
    ...metadata,
  };
  writeIfChanged(paths.metadata, `${JSON.stringify(value, null, 2)}\n`);
}

export function cleanVooyaWorkspace(
  applicationRoot: string,
  workspaceRoot?: string,
): VooyaWorkspacePaths {
  const paths = resolveVooyaWorkspace(applicationRoot, workspaceRoot);
  removeGeneratedEntries(paths);
  if (existsSync(paths.root) && readdirSync(paths.root).length === 0) {
    rmdirSync(paths.root);
  }
  return paths;
}

export function writeRustSchemaDeclarations({
  applicationRoot,
  contracts,
  stores,
  types,
  framework,
  artifacts,
  workspaceRoot,
}: WriteRustSchemaDeclarationsOptions): WrittenRustDeclarations {
  const application = resolve(applicationRoot);
  const paths = resolveVooyaWorkspace(application, workspaceRoot);
  ensureVooyaWorkspace(paths);
  const expected = new Map<string, string>();
  for (const artifact of artifacts ?? [{ contracts, stores, types }]) {
    const { contracts, stores, types } = artifact;
    for (const contract of contracts) {
      const group = contract.component.group;
      if (!group) throw new Error(`Rust component ${contract.component.name} is missing its source group.`);
      const sourcePath = resolveRustSchemaGroup(application, group);
      const sourceRelativePath = relative(application, sourcePath);
      if (isAbsolute(sourceRelativePath) || sourceRelativePath === ".." || sourceRelativePath.startsWith("../") || sourceRelativePath.startsWith("..\\")) {
        throw new Error(`Rust component ${contract.component.name} is outside application root ${application}.`);
      }
      if (!sourceRelativePath.endsWith(".rs")) throw new Error(`Rust component ${contract.component.name} group must point to an .rs file.`);
      const declarationPath = resolve(paths.types, sourceRelativePath.replace(/\.rs$/, ".d.rs.ts"));
      assertPathInside(declarationPath, paths.types);
      if (expected.has(declarationPath)) throw new Error(`Multiple Rust exports own declaration ${declarationPath}.`);
      expected.set(declarationPath, generateRustSchemaDeclaration({ contract, framework, types }));
    }
    for (const store of stores ?? []) {
      if (!store.group) throw new Error(`Rust store ${store.name} is missing its source group.`);
      const sourcePath = resolveRustSchemaGroup(application, store.group);
      const sourceRelativePath = relative(application, sourcePath);
      if (isAbsolute(sourceRelativePath) || sourceRelativePath === ".." || sourceRelativePath.startsWith("../") || sourceRelativePath.startsWith("..\\")) {
        throw new Error(`Rust store ${store.name} is outside application root ${application}.`);
      }
      if (!sourceRelativePath.endsWith(".rs")) throw new Error(`Rust store ${store.name} group must point to an .rs file.`);
      const declarationPath = resolve(paths.types, sourceRelativePath.replace(/\.rs$/, ".d.rs.ts"));
      assertPathInside(declarationPath, paths.types);
      if (expected.has(declarationPath)) throw new Error(`Multiple Rust exports own declaration ${declarationPath}.`);
      expected.set(declarationPath, generateRustStoreDeclaration(store, framework, types));
    }
  }
  // Resolve every graph before replacing any declaration from the last good build.
  for (const [path, code] of expected) writeIfChanged(path, code);
  for (const existing of readGeneratedDeclarations(paths.types, ".d.rs.ts")) {
    if (!expected.has(existing)) rmSync(existing, { force: true });
  }
  removeEmptyDirectories(paths.types, paths.types);
  return { typesRoot: paths.types, files: [...expected.keys()].sort() };
}

export function resolveRustSchemaGroup(application: string, group: string): string {
  const normalized = posix.normalize(group.replaceAll("\\", "/"));
  // Macro spans are recorded after Vooya copies a source into the generated
  // crate, so generated roots may prefix the authored path with `rust/`.
  // Keep the original form first, then try the equivalent application path.
  const suffixes = [
    normalized,
    normalized.replace(/^src\/rust\//, ""),
    normalized.replace(/^rust\//, ""),
  ];
  const directCandidates = [
    isAbsolute(group) ? group : "",
    resolve(application, group),
    ...suffixes.map((suffix) => resolve(application, suffix)),
  ].filter(Boolean);
  for (const candidate of directCandidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  const matches: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true, encoding: "utf8" })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== ".vooya" && entry.name !== "node_modules") visit(path);
      } else if (entry.isFile() && path.endsWith(".rs") && suffixes.some((suffix) => path.replaceAll("\\", "/").endsWith(suffix))) {
        matches.push(path);
      }
    }
  };
  visit(application);
  if (matches.length === 1) return matches[0];
  throw new Error(`Could not resolve Rust schema source group "${group}" under ${application}.`);
}

function readWorkspaceMetadata(
  paths: VooyaWorkspacePaths,
): VooyaWorkspaceMetadata | undefined {
  if (!existsSync(paths.metadata)) return undefined;
  try {
    return JSON.parse(readFileSync(paths.metadata, "utf8"));
  } catch (cause) {
    throw new Error(
      `Vooya workspace metadata is invalid at ${paths.metadata}. Run \`vooya clean\` and try again.`,
      { cause },
    );
  }
}

function removeGeneratedEntries(paths: VooyaWorkspacePaths): void {
  for (const path of [
    paths.build,
    paths.wasm,
    paths.types,
    paths.cache,
    paths.metadata,
  ]) {
    rmSync(path, { force: true, recursive: true });
  }
}

function readGeneratedDeclarations(directory: string, suffix: string): string[] {
  if (!existsSync(directory)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...readGeneratedDeclarations(path, suffix));
    else if (entry.isFile() && entry.name.endsWith(suffix)) files.push(path);
  }
  return files;
}

function removeEmptyDirectories(directory: string, root: string): void {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) removeEmptyDirectories(resolve(directory, entry.name), root);
  }
  if (directory !== root && readdirSync(directory).length === 0) {
    rmdirSync(directory);
  }
}

function assertPathInside(path: string, directory: string): void {
  const relativePath = relative(directory, path);
  if (
    relativePath === "" ||
    isAbsolute(relativePath) ||
    relativePath === ".." ||
    relativePath.startsWith("../") ||
    relativePath.startsWith("..\\")
  ) {
    throw new Error(`Generated path ${path} escapes Vooya workspace ${directory}.`);
  }
}

function writeIfChanged(path: string, content: string): void {
  try {
    if (readFileSync(path, "utf8") === content) return;
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}
