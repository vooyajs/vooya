import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import { parse } from "smol-toml";

import { VooyaUserError } from "./errors.js";

export type RustDependency =
  | string
  | {
      version?: string;
      path?: string;
      git?: string;
      branch?: string;
      tag?: string;
      rev?: string;
      package?: string;
      defaultFeatures?: boolean;
      features?: string[];
    };

export interface RustBuildOptions {
  dependencies?: Record<string, RustDependency>;
  webSysFeatures?: string[];
  /** Optional authored crate entry relative to applicationRoot. */
  entry?: string;
  /** Plain Rust files to include in the generated crate module graph. */
  files?: string[];
  /** Rust files explicitly exposed by the generated JS-facing root. */
  public?: string[];
  /** Directory containing authored Rust modules, relative to applicationRoot. */
  sourceRoot?: string;
}

export interface ResolvedRustBuildOptions {
  rust: RustBuildOptions;
  manifestPath?: string;
}

type TomlRecord = Record<string, unknown>;

const compilerManagedVersions: Record<string, string> = {
  "js-sys": "0.3.92",
  "wasm-bindgen": "0.2.115",
  "web-sys": "0.3.92",
};

/**
 * Apply the public Rust configuration precedence contract:
 * explicit `vooya({ rust })` values, then the nearest Cargo manifest, then
 * the defaults owned by the generated Vooya crate.
 */
export function resolveRustBuildOptions(
  applicationRoot: string,
  explicit: RustBuildOptions = {},
): ResolvedRustBuildOptions {
  const manifestPath = findNearestCargoManifest(applicationRoot, explicit);
  if (!manifestPath) return { rust: explicit };

  const manifest = readCargoManifest(manifestPath);
  const inherited = manifestDependencies(manifest, manifestPath, applicationRoot);
  const manifestWebSysFeatures = dependencyFeatures(inherited["web-sys"]);

  for (const [name, version] of Object.entries(compilerManagedVersions)) {
    assertManagedVersionCompatible(name, inherited[name], version, manifestPath);
    delete inherited[name];
  }
  // These crates are materialized from the installed @vooya/core package.
  delete inherited.vooya;
  delete inherited["vooya-core"];

  return {
    manifestPath,
    rust: {
      ...explicit,
      dependencies: {
        ...inherited,
        ...(explicit.dependencies ?? {}),
      },
      webSysFeatures:
        explicit.webSysFeatures === undefined
          ? manifestWebSysFeatures
          : explicit.webSysFeatures,
    },
  };
}

export function findNearestCargoManifest(
  applicationRoot: string,
  rust: RustBuildOptions = {},
): string | undefined {
  const root = resolve(applicationRoot);
  const boundary = findRepositoryBoundary(root);
  const startingDirectories = [
    rust.entry ? dirname(resolve(root, rust.entry)) : undefined,
    resolve(root, rust.sourceRoot ?? "src"),
    root,
  ].filter((value): value is string => Boolean(value));

  const visited = new Set<string>();
  for (const start of startingDirectories) {
    let directory = start;
    while (isWithin(directory, boundary) && !visited.has(directory)) {
      visited.add(directory);
      const candidate = resolve(directory, "Cargo.toml");
      if (isFile(candidate)) return candidate;
      if (directory === boundary) break;
      const parent = dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
  }
  return undefined;
}

function findRepositoryBoundary(root: string): string {
  let directory = root;
  while (true) {
    if (existsSync(resolve(directory, ".git"))) return directory;
    const parent = dirname(directory);
    if (parent === directory) return root;
    directory = parent;
  }
}

function readCargoManifest(path: string): TomlRecord {
  try {
    return parse(readFileSync(path, "utf8")) as TomlRecord;
  } catch (cause) {
    throw new VooyaUserError(`Vooya could not read Cargo manifest ${path}: ${describe(cause)}`, {
      kind: "cargo-manifest",
      cause,
    });
  }
}

function manifestDependencies(
  manifest: TomlRecord,
  manifestPath: string,
  applicationRoot: string,
): Record<string, RustDependency> {
  const table = asRecord(manifest.dependencies);
  if (!table) return {};
  const workspaceDependencies = readWorkspaceDependencies(manifestPath, applicationRoot);
  return Object.fromEntries(
    Object.entries(table).map(([name, value]) => [
      name,
      normalizeDependency(name, value, dirname(manifestPath), workspaceDependencies),
    ]),
  );
}

function readWorkspaceDependencies(
  manifestPath: string,
  applicationRoot: string,
): { root: string; dependencies: TomlRecord } | undefined {
  const boundary = findRepositoryBoundary(resolve(applicationRoot));
  let directory = dirname(manifestPath);
  while (isWithin(directory, boundary)) {
    const candidate = resolve(directory, "Cargo.toml");
    if (isFile(candidate)) {
      const workspace = asRecord(readCargoManifest(candidate).workspace);
      const dependencies = asRecord(workspace?.dependencies);
      if (dependencies) return { root: directory, dependencies };
    }
    if (directory === boundary) break;
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return undefined;
}

function normalizeDependency(
  name: string,
  value: unknown,
  manifestDirectory: string,
  workspace: { root: string; dependencies: TomlRecord } | undefined,
): RustDependency {
  if (typeof value === "string") return value;
  const record = asRecord(value);
  if (!record) throw invalidDependency(name, "must be a version string or table");

  if (record.workspace === true) {
    const inherited = workspace?.dependencies[name];
    if (inherited === undefined) {
      throw invalidDependency(name, "uses workspace = true but no [workspace.dependencies] entry was found");
    }
    const normalized = normalizeDependency(name, inherited, workspace!.root, undefined);
    const localFeatures = stringArray(record.features, name, "features");
    if (localFeatures.length === 0) return normalized;
    if (typeof normalized === "string") return { version: normalized, features: localFeatures };
    return { ...normalized, features: [...new Set([...(normalized.features ?? []), ...localFeatures])] };
  }

  const result: Exclude<RustDependency, string> = {};
  if (record.version !== undefined) result.version = stringValue(record.version, name, "version");
  if (record.path !== undefined) result.path = resolve(manifestDirectory, stringValue(record.path, name, "path"));
  if (record.git !== undefined) result.git = stringValue(record.git, name, "git");
  for (const key of ["branch", "tag", "rev", "package"] as const) {
    if (record[key] !== undefined) result[key] = stringValue(record[key], name, key);
  }
  if (record["default-features"] !== undefined) {
    if (typeof record["default-features"] !== "boolean") throw invalidDependency(name, "default-features must be a boolean");
    result.defaultFeatures = record["default-features"];
  }
  const features = stringArray(record.features, name, "features");
  if (features.length > 0) result.features = features;
  if (!result.version && !result.path && !result.git) {
    throw invalidDependency(name, "requires version, path, or git");
  }
  return result;
}

function assertManagedVersionCompatible(
  name: string,
  dependency: RustDependency | undefined,
  expected: string,
  manifestPath: string,
): void {
  const requested = typeof dependency === "string" ? dependency : dependency?.version;
  const exact = requested?.match(/^\s*=\s*(\d+\.\d+\.\d+)\s*$/)?.[1];
  if (exact && exact !== expected) {
    throw new VooyaUserError(
      `${manifestPath} pins ${name} ${requested}, but this Vooya release requires ${name} =${expected}. ` +
        "Remove the exact pin or use the compatible version so the generated crate and wasm-bindgen CLI stay aligned.",
      { kind: "cargo-manifest" },
    );
  }
}

function dependencyFeatures(dependency: RustDependency | undefined): string[] {
  return typeof dependency === "string" ? [] : dependency?.features ?? [];
}

function asRecord(value: unknown): TomlRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as TomlRecord)
    : undefined;
}

function stringValue(value: unknown, name: string, field: string): string {
  if (typeof value !== "string" || !value) throw invalidDependency(name, `${field} must be a non-empty string`);
  return value;
}

function stringArray(value: unknown, name: string, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw invalidDependency(name, `${field} must be an array of strings`);
  }
  return value as string[];
}

function invalidDependency(name: string, detail: string): VooyaUserError {
  return new VooyaUserError(`Cargo dependency ${JSON.stringify(name)} ${detail}.`, {
    kind: "cargo-manifest",
  });
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function isWithin(path: string, root: string): boolean {
  const offset = relative(resolve(root), resolve(path));
  return offset === "" || (!offset.startsWith("..") && !isAbsolute(offset));
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
