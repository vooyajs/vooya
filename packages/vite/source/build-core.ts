import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApplication as buildSharedApplication } from "@vooya/build-core";

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
