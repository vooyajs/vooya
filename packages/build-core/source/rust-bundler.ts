import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { compileVooStyle } from "@vooya/compiler";
import { buildRustComponentContracts, indexVooyaSchema, type RustSchemaDocument } from "./schema.js";
import { renderRustComponentModule, renderRustStoreModule } from "./rust-modules.js";
import { resolveRustSchemaGroup, writeRustSchemaDeclarations } from "./workspace.js";

/** Prepare file-backed modules for bundlers that do not use Vite virtual modules. */
export function prepareRustModules(options: {
  applicationRoot: string;
  workspaceRoot: string;
  schema: RustSchemaDocument;
  framework: "vue" | "react" | "solid" | "svelte";
  runtimeModule: string;
  runtimeHelpers: string;
  stylesRoot: string;
}): { modules: Map<string, string>; dependencies: string[] } {
  const { applicationRoot, workspaceRoot, schema, framework, stylesRoot } = options;
  const index = indexVooyaSchema(schema);
  const contracts = buildRustComponentContracts(index);
  writeRustSchemaDeclarations({ applicationRoot, workspaceRoot, framework, contracts, stores: index.stores, types: index.types });
  const modules = new Map<string, string>();
  const dependencies = new Set<string>();
  for (const contract of contracts) {
    if (!contract.component.group) continue;
    const id = resolveRustSchemaGroup(applicationRoot, contract.component.group);
    const styles = contract.component.styles ?? [];
    let styleModule: string | undefined;
    if (styles.length) {
      const content = styles.map((style) => {
        const path = resolve(dirname(id), style.path);
        dependencies.add(path);
        return readFileSync(path, "utf8");
      }).join("\n");
      const code = compileVooStyle({
        id, name: contract.component.name, props: [], events: [], rust: { content: "" },
        style: { content, scoped: styles.some((style) => style.scoped) },
      });
      styleModule = resolve(stylesRoot, `${createHash("sha256").update(id).digest("hex").slice(0, 16)}.css`);
      writeStyleIfChanged(styleModule, code);
    }
    modules.set(id, renderRustComponentModule(contract, framework, id, { ...options, styleModule }));
  }
  for (const store of index.stores) {
    if (!store.group) continue;
    const id = resolveRustSchemaGroup(applicationRoot, store.group);
    modules.set(id, renderRustStoreModule(store, framework, options));
  }
  return { modules, dependencies: [...dependencies] };
}

function writeStyleIfChanged(path: string, code: string): void {
  try {
    if (readFileSync(path, "utf8") === code) return;
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, code);
}

/** Directory watch events include generated children. Compare only authored inputs
 * so sourceRoot: "." does not rebuild Rust in response to its own artifacts.
 * Only Rust/legacy sources and Cargo manifests are scanned; linked styles are
 * explicit file roots. JavaScript and asset contents are never read or hashed. */
export function rustInputFingerprint(roots: string[], workspaceRoot: string, outputRoot?: string): string {
  const hash = createHash("sha256");
  const visited = new Set<string>();
  const inside = (path: string, root: string): boolean => {
    const part = relative(root, path);
    return part === "" || (!isAbsolute(part) && part !== ".." && !part.startsWith("../") && !part.startsWith("..\\"));
  };
  const visit = (path: string): void => {
    if (visited.has(path) || inside(path, workspaceRoot) || (outputRoot && inside(path, outputRoot))) return;
    visited.add(path);
    const stat = statSync(path, { throwIfNoEntry: false });
    if (!stat) { hash.update(`missing:${path}\n`); return; }
    if (stat.isDirectory()) {
      for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        if (["node_modules", ".git", "target"].includes(entry.name) || entry.isSymbolicLink()) continue;
        if (entry.isDirectory() || /\.(rs|voo)$/.test(entry.name) || /^Cargo\.(toml|lock)$/.test(entry.name)) {
          visit(resolve(path, entry.name));
        }
      }
    } else {
      hash.update(`${path}:${stat.size}:${stat.mtimeMs}\n`);
    }
  };
  for (const root of roots) visit(root);
  return hash.digest("hex");
}
