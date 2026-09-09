import { isAbsolute, relative, resolve } from "node:path";
import type { RustBuildOptions } from "@vooya/build-core";

export function modulePath(id: string): string {
  const query = id.indexOf("?");
  const hash = id.indexOf("#");
  const boundary = query === -1 ? hash : hash === -1 ? query : Math.min(query, hash);
  return boundary === -1 ? id : id.slice(0, boundary);
}

export function isPathInside(file: string, directory: string): boolean {
  const path = relative(directory, file);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

export function isVooyaSourceChange(
  file: string,
  generatedWorkspaceRoot: string | undefined,
  watchedRustRoots: string[] = [],
): boolean {
  if (generatedWorkspaceRoot && isPathInside(file, generatedWorkspaceRoot)) return false;
  return file.endsWith(".voo") || file.endsWith(".rs") || watchedRustRoots.some((root) => isPathInside(file, root));
}

export function unresolvedRustImportMessage(
  file: string,
  applicationRoot: string,
  rust: RustBuildOptions = {},
): string {
  const sourceRoot = resolve(applicationRoot, rust.sourceRoot ?? "src");
  const sourceRelative = relative(sourceRoot, file).replaceAll("\\", "/");
  const isInsideSourceRoot = sourceRelative !== "" && !sourceRelative.startsWith("../") && !isAbsolute(sourceRelative);
  const parts = sourceRelative.split("/");
  if (isInsideSourceRoot && parts.length > 1 && parts.at(-1) !== "mod.rs" && !rust.entry) {
    return `Vooya cannot expose nested Rust file ${file} as an automatic crate root. ` +
      `Move the public Component or Store to ${rust.sourceRoot ?? "src"}/*.rs, use a directory mod.rs, ` +
      `or configure rust.entry for a conventional Rust module tree.`;
  }
  return `Vooya imported ${file}, but the compiled schema contains no public Component or Store for that file. ` +
    `Add a #[voo::component] or #[voo::store] role, or import the public Rust module that owns it.`;
}
