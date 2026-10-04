import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { platform } from "node:os";
import { relative, resolve } from "node:path";

import { resolveVooyaWorkspace } from "@vooya/build-core";

export function inspectGeneratedTypesConfiguration(
  applicationRoot: string,
  workspaceRoot?: string,
) {
  const root = resolve(applicationRoot);
  let typescript: typeof import("typescript");
  try {
    typescript = createRequire(resolve(root, "package.json"))("typescript");
  } catch {
    return undefined;
  }
  const applicationConfig = resolve(root, "tsconfig.app.json");
  const configPath = existsSync(applicationConfig)
    ? applicationConfig
    : typescript.findConfigFile(root, typescript.sys.fileExists);
  if (!configPath || !existsSync(configPath)) return undefined;
  const loaded = typescript.readConfigFile(configPath, typescript.sys.readFile);
  if (loaded.error) return undefined;
  const parsed = typescript.parseJsonConfigFileContent(
    loaded.config,
    typescript.sys,
    resolve(configPath, ".."),
    undefined,
    configPath,
  );
  const expectedTypes = resolveVooyaWorkspace(root, workspaceRoot).types;
  const rootDirs = parsed.options.rootDirs ?? [];
  const complete =
    parsed.options.allowArbitraryExtensions === true &&
    rootDirs.some((entry) => samePath(entry, root)) &&
    rootDirs.some((entry) => samePath(entry, expectedTypes));
  if (complete) return undefined;
  const relativeTypes = relative(root, expectedTypes).replaceAll("\\", "/");
  const typesEntry = relativeTypes.startsWith("../") ? expectedTypes : relativeTypes;
  return {
    configPath,
    message:
      `Vooya generated component types require allowArbitraryExtensions and rootDirs in ${configPath}. ` +
      `Add \"allowArbitraryExtensions\": true and \"rootDirs\": [\".\", ${JSON.stringify(typesEntry)}] to compilerOptions.`,
  };
}

function samePath(left: string, right: string) {
  const normalize = (value: string) =>
    platform() === "win32" ? resolve(value).toLowerCase() : resolve(value);
  return normalize(left) === normalize(right);
}
