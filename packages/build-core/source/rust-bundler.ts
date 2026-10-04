import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
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
      mkdirSync(dirname(styleModule), { recursive: true });
      writeFileSync(styleModule, code);
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
