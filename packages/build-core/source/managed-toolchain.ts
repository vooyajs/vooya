import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { VooyaUserError } from "./errors.js";
import type { ToolchainEnvironment } from "./toolchain.js";

export type ToolchainMode = "auto" | "system" | "managed";

/** Optional project package; build-core never installs npm packages itself. */
export function prepareProjectToolchain({ cwd, env, mode = "auto", cargoPath }: {
  cwd: string; env: ToolchainEnvironment; mode?: ToolchainMode; cargoPath?: string;
}): { cargoPath: string; environment: ToolchainEnvironment } | undefined {
  const selected = mode === "auto" ? env.VOOYA_TOOLCHAIN ?? mode : mode;
  if (!["auto", "system", "managed"].includes(selected)) {
    throw new VooyaUserError(`Unknown Vooya toolchain mode ${selected}; expected auto, system, or managed.`, { kind: "toolchain" });
  }
  if (selected === "system") return undefined;
  if (cargoPath !== undefined) {
    if (selected === "managed") throw new VooyaUserError("toolchain.cargoPath cannot be combined with managed mode. Select system mode to use an explicit Cargo installation.", { kind: "toolchain" });
    return undefined;
  }
  const project = findPresetProject(cwd);
  if (!project && selected === "auto") return undefined;
  let entry: string;
  try { entry = createRequire(join(project ?? resolve(cwd), "package.json")).resolve("@vooya/preset/prepare"); }
  catch (cause) {
    throw new VooyaUserError("Managed Rust tools require @vooya/preset in this project's devDependencies. Install it or select toolchain.mode: 'system'.", { kind: "toolchain", cause });
  }
  const child = spawnSync(process.execPath, [entry], { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  if (child.error || child.status !== 0) {
    throw new VooyaUserError("Vooya could not prepare its managed Rust toolchain. See the installer output above; system tools are not selected silently.", { kind: "toolchain", cause: child.error });
  }
  const result = JSON.parse(child.stdout);
  const environment: ToolchainEnvironment = { ...env };
  for (const [key, value] of Object.entries(result.environment)) {
    if (value === null) delete environment[key];
    else environment[key] = String(value);
  }
  if (process.platform === "win32") delete environment.Path;
  return { cargoPath: result.cargoPath, environment };
}
function findPresetProject(cwd: string): string | undefined {
  let directory = resolve(cwd);
  while (true) {
    const manifest = join(directory, "package.json");
    if (existsSync(manifest)) {
      const pkg = JSON.parse(readFileSync(manifest, "utf8"));
      if (pkg.dependencies?.["@vooya/preset"] || pkg.devDependencies?.["@vooya/preset"]) return directory;
    }
    const parent = dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}
