// Public compatibility facade. Rust compilation is owned by the reference
// provider; existing bundlers and consumers retain the same API and artifacts.
import { rustProvider } from "./rust-provider.js";
import type { BuildApplicationOptions, BuildApplicationResult } from "./rust-provider.js";

export * from "./errors.js";
export * from "./cargo-manifest.js";
export * from "./schema.js";
export * from "./schema-declarations.js";
export * from "./toolchain.js";
export * from "./workspace.js";
export type { MappedDiagnostic, BuildAsset, WasmAsset, GeneratedCss, GeneratedDeclaration } from "./provider.js";
export type { BuildMetadata, BuildSpawnResult, BuildSpawn, BuildExec, BuildApplicationOptions, BuildApplicationResult } from "./rust-provider.js";
export {
  rustModuleIdentifier, generateRustCrateRoot, generateRustSourceRoot,
  selectRustRootModules, resolveVooyaCrateRoot, discoverRustSourceFiles,
  resolveRuntimeCrateRoot, resolveVooyaAuthoringCrateRoot,
  resolveRustDependencyRoots, buildCore, generatedCargoManifest, remapRustDiagnostic,
} from "./rust-provider.js";

export function buildApplication(options: BuildApplicationOptions): BuildApplicationResult {
  return rustProvider.build(options);
}
