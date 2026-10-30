import { realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { resolveRustBuildOptions } from "./cargo-manifest.js";
import type { RustBuildOptions } from "./cargo-manifest.js";
import { VooyaUserError } from "./errors.js";
import { buildApplicationBatch, resolveRuntimeCrateRoot, resolveRustDependencyRoots } from "./rust-provider.js";
import type { BuildApplicationOptions, BuildApplicationResult } from "./rust-provider.js";
import { resolveVooyaWorkspace } from "./workspace.js";

export interface RustArtifactBuild {
  id: string;
  rust: RustBuildOptions;
  sourceRoot: string;
  workspaceRoot: string;
}
export interface BuiltRustArtifact extends RustArtifactBuild {
  result: BuildApplicationResult;
}

/** Plan separate Cargo crates without binding their orchestration to a bundler. */
export function planRustArtifacts(options: BuildApplicationOptions): RustArtifactBuild[] {
  const { artifacts, ...defaults } = options.rust ?? {};
  if (!artifacts || typeof artifacts !== "object" || Array.isArray(artifacts) || !Object.keys(artifacts).length) throw artifactError("rust.artifacts must contain at least one named build unit.");
  for (const field of ["sourceRoot", "entry", "files", "public"] as const) {
    if (defaults[field] !== undefined) throw artifactError(`Configure rust.${field} inside each artifact, not alongside rust.artifacts.`);
  }
  const workspace = resolveVooyaWorkspace(options.applicationRoot, options.workspaceRoot);
  const applicationPath = physicalPath(options.applicationRoot);
  const workspacePath = physicalPath(workspace.root);
  const units = Object.entries(artifacts).sort(([a], [b]) => a.localeCompare(b)).map(([id, config]) => {
    if (!/^[a-z][a-z0-9-]*$/.test(id)) throw artifactError(`Invalid artifact name ${JSON.stringify(id)}; use lowercase letters, digits and hyphens.`);
    if (!config || typeof config !== "object" || Array.isArray(config) || typeof config.sourceRoot !== "string" || !config.sourceRoot) throw artifactError(`Artifact ${id} requires an explicit sourceRoot.`);
    if ("artifacts" in config) throw artifactError(`Artifact ${id} cannot contain nested artifacts.`);
    const sourceRoot = resolve(options.applicationRoot, config.sourceRoot);
    const sourcePath = physicalPath(sourceRoot);
    if (!inside(sourcePath, applicationPath) || inside(sourcePath, workspacePath) || inside(workspacePath, sourcePath)) {
      throw artifactError(`Artifact ${id} must use a sourceRoot inside the application and outside its generated workspace.`);
    }
    const rust: RustBuildOptions = {
      ...defaults, ...config,
      dependencies: { ...defaults.dependencies, ...config.dependencies },
    };
    for (const file of [...(rust.files ?? []), ...(rust.entry ? [rust.entry] : [])]) {
      if (!inside(physicalPath(resolve(options.applicationRoot, file)), sourcePath)) throw artifactError(`Artifact ${id} input ${file} must be inside its sourceRoot; share code through Cargo path dependencies.`);
    }
    return { id, rust, sourceRoot, workspaceRoot: resolve(workspace.root, "artifacts", id) };
  });
  for (let index = 0; index < units.length; index++) {
    for (const other of units.slice(index + 1)) {
      if (inside(physicalPath(units[index].sourceRoot), physicalPath(other.sourceRoot)) || inside(physicalPath(other.sourceRoot), physicalPath(units[index].sourceRoot))) {
        throw artifactError(`Artifact source roots overlap: ${units[index].id} and ${other.id}. Each authored source must have one owning artifact.`);
      }
    }
  }
  return units;
}

/** A session commits dirty artifacts together and retries the whole dirty batch after errors. */
export function createRustArtifactBuilder(options: BuildApplicationOptions) {
  const units = planRustArtifacts(options);
  const generatedRoot = resolveVooyaWorkspace(options.applicationRoot, options.workspaceRoot).root;
  const results = new Map<string, BuiltRustArtifact>();
  const dirty = new Set(units.map(unit => unit.id));
  const rootsFor = (unit: RustArtifactBuild): string[] => {
    const resolved = resolveRustBuildOptions(options.applicationRoot, unit.rust);
    return [unit.sourceRoot, ...(resolved.manifestPath ? [resolved.manifestPath] : []),
      resolve(options.runtimeCrateRoot ?? resolveRuntimeCrateRoot(), "src"),
      ...resolveRustDependencyRoots(resolved.rust, options.applicationRoot)];
  };
  return {
    units,
    watchedFiles: () => [...new Set(units.flatMap(rootsFor))],
    build(changedFiles?: readonly string[]): BuiltRustArtifact[] {
      for (const unit of units) {
        if (changedFiles === undefined || changedFiles.some(file => !inside(file, generatedRoot) && rootsFor(unit).some(root => inside(file, root)))) dirty.add(unit.id);
      }
      const pending = units.filter(unit => dirty.has(unit.id));
      const built = buildApplicationBatch(pending.map(unit => ({
        ...options, rust: unit.rust, workspaceRoot: unit.workspaceRoot, workspacePath: undefined, outputDir: undefined,
      })));
      for (const [index, unit] of pending.entries()) {
        results.set(unit.id, { ...unit, result: built[index] });
        dirty.delete(unit.id);
      }
      return units.map(unit => results.get(unit.id)!);
    },
  };
}

function inside(file: string, root: string): boolean {
  const path = relative(resolve(root), resolve(file));
  return path === "" || (!isAbsolute(path) && path !== ".." && !path.startsWith("../") && !path.startsWith("..\\"));
}
function artifactError(message: string): VooyaUserError {
  return new VooyaUserError(message, { kind: "artifact-config" });
}

/** Resolve existing ancestors too, since the generated workspace may not exist yet. */
function physicalPath(path: string): string {
  const absolute = resolve(path);
  try { return realpathSync(absolute); } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== "ENOENT" || dirname(absolute) === absolute) throw cause;
    return resolve(physicalPath(dirname(absolute)), basename(absolute));
  }
}
