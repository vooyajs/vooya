import type { Plugin, Logger } from "vite";
import type { RustComponentContract, RustStoreSchema, ResolvedToolchain } from "@vooya/build-core";
import type { SourceComponent } from "@vooya/compiler";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  buildApplication,
  clearToolchainCache,
  formatResolvedToolchain,
  isVooyaUserError,
  resolveVooyaWorkspace,
  resolveRuntimeCrateRoot,
  resolveRustBuildOptions,
  resolveRustDependencyRoots,
  resolveToolchain,
  buildRustComponentContracts,
  indexVooyaSchema,
  writeRustSchemaDeclarations,
  writeVooDeclarations,
  renderRustComponentModule,
  renderRustStoreModule,
} from "@vooya/build-core";
import type { RustBuildOptions } from "@vooya/build-core";
import { createBuildScheduler } from "./build-scheduler.js";
import {
  compileVooStyle,
  generatedAdapterDefinition,
  generatedComponentBinding,
  parseVooComponent,
} from "@vooya/compiler";
import { readVooComponents } from "./voo-project.js";
import { inspectGeneratedTypesConfiguration } from "./typescript-config.js";
import {
  indexRustRecordsByFile,
  isPathInside,
  isVooyaSourceChange,
  modulePath,
  unresolvedRustImportMessage,
} from "./module-resolution.js";

const componentExtension = ".voo";
const rustExtension = ".rs";
// Match Vite's explicit raw asset query; normal imports still compile.
const rawQuery = /(?:\?|&)raw(?:&|$)/;
const runtimeId = "virtual:vooya-runtime";
const stylePrefix = "virtual:vooya-style:";
const rustStylePrefix = "virtual:vooya-rust-style:";

export type VooyaFramework = "vue" | "react" | "solid" | "svelte" | "octane";

export interface VooyaPluginOptions {
  framework?: VooyaFramework;
  rust?: RustBuildOptions;
  toolchain?: { cargoPath?: string; mode?: "auto" | "system" | "managed" };
  workspace?: { root?: string };
}

export function vooya({
  framework = "vue",
  rust = {},
  toolchain: toolchainOptions = {},
  workspace: workspaceOptions = {},
}: VooyaPluginOptions = {}): Plugin {
  if (!isSupportedFramework(framework)) {
    throw new Error(`Unknown Vooya framework ${framework}.`);
  }
  let applicationRoot: string;
  let buildScheduler: ReturnType<typeof createBuildScheduler> | undefined;
  let runtimeModule: string | undefined;
  let toolchain: ResolvedToolchain | undefined;
  let sourceComponents: SourceComponent[] = [];
  let rustContracts: RustComponentContract[] = [];
  let rustStores: RustStoreSchema[] = [];
  let rustContractsByFile = new Map<string, RustComponentContract>();
  let rustStoresByFile = new Map<string, RustStoreSchema>();
  let watchedRustRoots: string[] = [];
  let logger: Logger | undefined;
  let hasInitialBuild = false;
  let generatedWorkspaceRoot: string | undefined;

  const handleVooyaHotUpdate = ({ file }: { file: string }) => {
    if (!isVooyaSourceChange(file, generatedWorkspaceRoot, watchedRustRoots)) return;
    buildScheduler?.schedule();
    // The generated WASM module owns live component handles. Letting the
    // framework hot-replace a .voo importer first would run cleanup against a
    // newly initialized WASM instance, so only send our post-build reload.
    return [];
  };

  const compile = () => {
    const components = applicationRoot ? readVooComponents(applicationRoot) : [];
    sourceComponents = components.filter((component) => component.format === "source");
    if (framework === "octane" && components.length > 0) throw new Error("Octane supports Rust .rs sources; legacy .voo sources are not supported.");
    if (framework !== "octane") writeVooDeclarations({ applicationRoot, components, framework, workspaceRoot: workspaceOptions.root });
    const progress = createRustBuildProgress(logger);
    try {
      if (!toolchain) {
        toolchain = resolveToolchain({
          cwd: applicationRoot,
          cargoPath: toolchainOptions?.cargoPath,
          mode: toolchainOptions?.mode,
        });
        logger?.info(`Vooya: selected Rust/WASM toolchain: ${formatResolvedToolchain(toolchain)}.`);
        if (toolchain.cargoPathWarning) {
          logger?.warn(`Vooya: WARNING: ${toolchain.cargoPathWarning} This may differ from the toolchain you intended to use.`);
        }
      }
      const buildResult = buildApplication({
        applicationRoot,
        components: sourceComponents,
        rust,
        framework,
        workspaceRoot: generatedWorkspaceRoot,
        toolchain,
        onRustBuildStart: progress.start,
      });
      runtimeModule = buildResult.runtimeModule;
      const schemaIndex = indexVooyaSchema(buildResult.schema);
      rustContracts = buildRustComponentContracts(schemaIndex);
      rustStores = schemaIndex.stores;
      rustContractsByFile = new Map();
      rustStoresByFile = new Map();
      if (sourceComponents.length === 0) {
        rustContractsByFile = indexRustRecordsByFile(applicationRoot, rustContracts, (contract: RustComponentContract) => contract.component.group);
        rustStoresByFile = indexRustRecordsByFile(applicationRoot, rustStores, (store) => store.group);
        writeRustSchemaDeclarations({
          applicationRoot,
          contracts: rustContracts,
          stores: schemaIndex.stores,
          types: schemaIndex.types,
          framework,
          workspaceRoot: workspaceOptions.root,
        });
      }
      progress.complete();
    } catch (error) {
      if (isToolchainExecutionError(error)) {
        toolchain = undefined;
        clearToolchainCache();
      }
      // Cargo has already rendered source-mapped .voo diagnostics. Keep this
      // summary separate so Vite can preserve those diagnostics verbatim.
      progress.fail();
      throw error;
    }
  };

  const ensureCompiled = () => {
    if (hasInitialBuild && runtimeModule) return;
    compile();
    hasInitialBuild = true;
  };

  return {
    name: "vooya",
    enforce: "pre",
    configResolved(config) {
      applicationRoot = config.root;
      logger = config.logger;
      generatedWorkspaceRoot = resolveVooyaWorkspace(applicationRoot, workspaceOptions.root).root;
      const typesProblem = inspectGeneratedTypesConfiguration(
        applicationRoot,
        workspaceOptions.root,
      );
      if (typesProblem) logger?.warn(`Vooya: WARNING: ${typesProblem.message}`);
    },
    buildStart() {
      // Astro creates multiple Vite environments from one plugin instance.
      // They share one generated browser artifact and must not race rebuilding it.
      ensureCompiled();
    },
    resolveId(source, importer, options) {
      if (source === runtimeId) return runtimeModule;
      if (source.startsWith(stylePrefix)) return source;
      if (source.startsWith(rustStylePrefix)) return source;
      if (rawQuery.test(source)) return null;
      if (!importer) return null;
      const sourcePath = modulePath(source);
      const suffix = source.slice(sourcePath.length);
      if (sourcePath.endsWith(rustExtension)) {
        return `${resolve(dirname(modulePath(importer)), sourcePath)}${suffix}`;
      }
      if (!sourcePath.endsWith(componentExtension)) return null;
      // Preserve Vite's root, alias and package semantics without re-entering
      // this plugin for the delegated request.
      return this.resolve(source, importer, { ...options, skipSelf: true });
    },
    load(id) {
      if (rawQuery.test(id)) return null;
      const cleanId = modulePath(id);
      if (cleanId.startsWith(stylePrefix)) {
        const componentId = decodeURIComponent(cleanId.slice(stylePrefix.length, -4));
        const component = parseVooComponent(readFileSync(componentId, "utf8"), componentId);
        if (component.format !== "source") this.error("Vooya style modules require source components.");
        return compileVooStyle({ ...component, id: componentId });
      }
      if (cleanId.startsWith(rustStylePrefix)) {
        const payload: unknown = JSON.parse(Buffer.from(cleanId.slice(rustStylePrefix.length, -4), "base64url").toString("utf8"));
        if (!isRustStylePayload(payload)) this.error("Invalid Vooya Rust style module payload.");
        const componentId = payload.componentId;
        const componentName = payload.name;
        const styles = payload.styles ?? [];
        const content = styles.map((style) => {
          const stylePath = resolve(dirname(componentId), style.path);
          return readFileSync(stylePath, "utf8");
        }).join("\n");
        const scoped = styles.some((style) => style.scoped);
        return compileVooStyle({
          id: componentId,
          name: componentName,
          props: [],
          events: [],
          rust: { content: "" },
          style: { content, scoped },
        });
      }
      if (cleanId.endsWith(rustExtension)) {
        ensureCompiled();
        const contract = rustContractsByFile.get(resolve(cleanId));
        if (contract) {
          return generateRustComponentModule(contract, framework, cleanId);
        }
        const store = rustStoresByFile.get(resolve(cleanId));
        if (store) {
          return generateRustStoreModule(store, framework);
        }
        this.error(unresolvedRustImportMessage(cleanId, applicationRoot, rust));
      }
      if (!cleanId.endsWith(componentExtension)) return null;
      const component = parseVooComponent(readFileSync(cleanId, "utf8"), cleanId);
      if (component.format === "source") {
        component.id = cleanId;
        const { exportName, disposeName, updateNames } = generatedComponentBinding(component);
        const definition = generatedAdapterDefinition(component);
        const adapter = adapterPackage(framework);
        return `
          ${component.style ? `import "${stylePrefix}${encodeURIComponent(cleanId)}.css";` : ""}
          import init, { ${exportName}, ${disposeName}, ${Object.values(updateNames).join(", ")}${Object.keys(updateNames).length ? ", " : ""}voo_abi_version } from "${runtimeId}";
          import { defineVooyaComponent } from "${adapter}";
          import { assertVooAbiVersion, initializeWasm } from "@vooya/vite/runtime";

          let bindings;
          async function loadBindings() {
            if (!bindings) {
              bindings = initializeWasm(init).then(() => {
                assertVooAbiVersion(voo_abi_version());
                return {
                  mount(host, ...props) {
                    const handle = ${exportName}(host, ...props);
                    return {
                      dispose() { ${disposeName}(handle); },
                      ${Object.entries(updateNames).map(([prop, name]) => `update_${prop}(value) { ${name}(handle, value); }`).join(",\n                      ")}
                    };
                  }
                };
              });
            }
            return bindings;
          }

          export const metadata = ${JSON.stringify(componentMetadata(component))};
          export default defineVooyaComponent({
            contract: ${JSON.stringify(definition)},
            loadBindings,
          });
        `;
      }
      const adapter = adapterPackage(framework);
      const factory = component.adapters[framework];
      if (!factory) {
        this.error(`Unsupported Voo component ${component.name} for framework ${framework}.`);
      }

      return `
        import init, { ${component.exportName} } from "${component.runtime}";
        import { ${factory} } from "${adapter}";

        let bindings;
        async function loadBindings() {
          if (!bindings) {
            bindings = init().then(() => ({ ${component.exportName} }));
          }
          return bindings;
        }

        export const metadata = ${JSON.stringify({
          name: component.name,
          runtime: component.runtime,
          export: component.exportName,
          adapters: component.adapters,
          props: component.props,
          events: component.events,
        })};
        export default ${factory}(loadBindings);
      `;
    },
    configureServer(server) {
      const resolvedRust = resolveRustBuildOptions(applicationRoot, rust);
      watchedRustRoots = [
        resolve(resolveRuntimeCrateRoot(), "src"),
        ...(resolvedRust.manifestPath ? [resolvedRust.manifestPath] : []),
        ...resolveRustDependencyRoots(resolvedRust.rust, applicationRoot),
      ];
      server.watcher.add(watchedRustRoots);
      buildScheduler = createBuildScheduler({
        build: compile,
        onSuccess() {
          server.ws.send({ type: "full-reload" });
        },
        onError(cause) {
          const error = cause instanceof Error ? cause : new Error(String(cause));
          const stack = isVooyaUserError(error) ? "" : error.stack ?? "";
          server.config.logger.error(isVooyaUserError(error) ? error.message : stack);
          server.ws.send({
            type: "error",
            err: { message: error.message, stack },
          });
        },
      });
      server.httpServer?.once("close", () => buildScheduler?.dispose());
    },
    hotUpdate: handleVooyaHotUpdate,
  };
}

function formatBuildDuration(duration: number) {
  return `${Math.max(0, Math.round(duration))}ms`;
}

export function createRustBuildProgress(logger: Pick<Logger, "info"> | undefined, now = () => performance.now()) {
  let startedAt: number | undefined;
  const elapsed = (start: number) => formatBuildDuration(now() - start);
  return {
    start() {
      startedAt = now();
      logger?.info("Vooya: building Rust/WASM source…");
    },
    complete() {
      if (startedAt !== undefined) logger?.info(`Vooya: Rust/WASM build complete in ${elapsed(startedAt)}.`);
    },
    fail() {
      if (startedAt !== undefined) logger?.info(`Vooya: Rust/WASM build failed after ${elapsed(startedAt)}.`);
    },
  };
}

function isToolchainExecutionError(error: unknown) {
  return (
    (error instanceof Error && "code" in error && typeof error.code === "string" && ["EACCES", "ENOENT", "EPERM"].includes(error.code)) ||
    (isVooyaUserError(error) && ["cargo-start", "wasm-bindgen"].includes(error.kind))
  );
}

function componentMetadata(component: SourceComponent) {
  return {
    abiVersion: generatedAdapterDefinition(component).abiVersion,
    name: component.name,
    props: component.props,
    events: component.events,
  };
}

export function generateRustComponentModule(contract: RustComponentContract, framework: VooyaFramework = "vue", componentId = contract.component.group ?? contract.component.name) {
  const styles = contract.component.styles ?? [];
  const styleModule = styles.length
    ? `${rustStylePrefix}${Buffer.from(JSON.stringify({ componentId, name: contract.component.name, styles })).toString("base64url")}.css`
    : undefined;
  return renderRustComponentModule(contract, framework, componentId, {
    runtimeModule: runtimeId,
    runtimeHelpers: "@vooya/vite/runtime",
    styleModule,
  });
}

export function generateRustStoreModule(store: RustStoreSchema, framework: VooyaFramework = "vue") {
  return renderRustStoreModule(store, framework, {
    runtimeModule: runtimeId,
    runtimeHelpers: "@vooya/vite/runtime",
  });
}

export const generateRustVueModule = (contract: RustComponentContract) => generateRustComponentModule(contract, "vue");
export const generateRustSolidModule = (contract: RustComponentContract) => generateRustComponentModule(contract, "solid");
export const generateRustSvelteModule = (contract: RustComponentContract) => generateRustComponentModule(contract, "svelte");
export const generateRustVueStoreModule = (store: RustStoreSchema) => generateRustStoreModule(store, "vue");
export const generateRustSolidStoreModule = (store: RustStoreSchema) => generateRustStoreModule(store, "solid");
export const generateRustSvelteStoreModule = (store: RustStoreSchema) => generateRustStoreModule(store, "svelte");

function isSupportedFramework(framework: unknown): framework is VooyaFramework {
  return framework === "vue" || framework === "react" || framework === "solid" || framework === "svelte" || framework === "octane";
}

function adapterPackage(framework: VooyaFramework) {
  if (!isSupportedFramework(framework)) throw new Error(`Unknown Vooya framework ${framework}.`);
  return `@vooya/${framework}`;
}


interface RustStylePayload { componentId: string; name: string; styles?: { path: string; scoped: boolean }[] }
function isRustStylePayload(value: unknown): value is RustStylePayload {
  if (!value || typeof value !== "object" || !("componentId" in value) || typeof value.componentId !== "string" || !("name" in value) || typeof value.name !== "string") return false;
  if (!("styles" in value) || value.styles === undefined) return true;
  return Array.isArray(value.styles) && value.styles.every((style: unknown) => !!style && typeof style === "object" && "path" in style && typeof style.path === "string" && "scoped" in style && typeof style.scoped === "boolean");
}
