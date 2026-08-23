// Vite supplies hook contexts dynamically. The public plugin implementation
// is TypeScript-authored; its Vite hook boundary remains intentionally loose.
// @ts-nocheck
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import {
  buildApplication,
  clearToolchainCache,
  formatResolvedToolchain,
  isVooyaUserError,
  resolveVooyaWorkspace,
  resolveRuntimeCrateRoot,
  resolveRustDependencyRoots,
  resolveToolchain,
  buildRustComponentContracts,
  indexVooyaSchema,
  writeRustSchemaDeclarations,
  writeVooDeclarations,
  rustTypeToRuntimeType,
} from "@vooya/build-core";
import { createBuildScheduler } from "./build-scheduler.js";
import {
  compileVooStyle,
  generatedAdapterDefinition,
  generatedComponentBinding,
  parseVooComponent,
  generatedScopeId,
} from "@vooya/compiler";
import { readVooComponents } from "./voo-project.js";
import { inspectGeneratedTypesConfiguration } from "./typescript-config.js";

const componentExtension = ".voo";
const rustExtension = ".rs";
const runtimeId = "virtual:vooya-runtime";
const stylePrefix = "virtual:vooya-style:";
const rustStylePrefix = "virtual:vooya-rust-style:";

export function vooya({
  framework = "vue",
  rust = {},
  toolchain: toolchainOptions = {},
  workspace: workspaceOptions = {},
} = {}) {
  let applicationRoot;
  let buildScheduler;
  let runtimeModule;
  let toolchain;
  let sourceComponents = [];
  let rustContracts = [];
  let rustStores = [];
  let watchedRustRoots = [];
  let logger;

  const handleVooyaHotUpdate = ({ file }) => {
    if (
      !file.endsWith(componentExtension) &&
      !file.endsWith(rustExtension) &&
      !watchedRustRoots.some((root) => isPathInside(file, root))
    ) {
      return;
    }
    buildScheduler?.schedule();
    // The generated WASM module owns live component handles. Letting the
    // framework hot-replace a .voo importer first would run cleanup against a
    // newly initialized WASM instance, so only send our post-build reload.
    return [];
  };

  const compile = () => {
    const components = applicationRoot ? readVooComponents(applicationRoot) : [];
    sourceComponents = components.filter((component) => component.format === "source");
    writeVooDeclarations({ applicationRoot, components, framework, workspaceRoot: workspaceOptions.root });
    const progress = createRustBuildProgress(logger);
    try {
      if (!toolchain) {
        toolchain = resolveToolchain({
          cwd: applicationRoot,
          cargoPath: toolchainOptions?.cargoPath,
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
        workspaceRoot: resolveVooyaWorkspace(applicationRoot, workspaceOptions.root).root,
        toolchain,
        onRustBuildStart: progress.start,
      });
      runtimeModule = buildResult.runtimeModule;
      const schemaIndex = indexVooyaSchema(buildResult.schema);
      rustContracts = buildRustComponentContracts(schemaIndex);
      rustStores = schemaIndex.stores;
      if (sourceComponents.length === 0) {
        writeRustSchemaDeclarations({
          applicationRoot,
          contracts: rustContracts,
          stores: schemaIndex.stores,
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

  return {
    name: "vooya",
    enforce: "pre",
    configResolved(config) {
      applicationRoot = config.root;
      logger = config.logger;
      const typesProblem = inspectGeneratedTypesConfiguration(
        applicationRoot,
        workspaceOptions.root,
      );
      if (typesProblem) logger?.warn(`Vooya: WARNING: ${typesProblem.message}`);
    },
    buildStart() {
      compile();
    },
    resolveId(source, importer, options = {}) {
      if (source === runtimeId) return runtimeModule;
      if (source.startsWith(stylePrefix)) return `\0${source}`;
      if (source.startsWith(rustStylePrefix)) return `\0${source}`;
      if (!importer) return null;
      if (source.endsWith(rustExtension)) return resolve(importer, "..", source);
      if (!source.endsWith(componentExtension)) return null;
      // Preserve Vite's root, alias and package semantics without re-entering
      // this plugin for the delegated request.
      return this.resolve(source, importer, { ...options, skipSelf: true });
    },
    load(id) {
      if (id.startsWith(`\0${stylePrefix}`)) {
        const componentId = decodeURIComponent(id.slice(stylePrefix.length + 1, -4));
        const component = parseVooComponent(readFileSync(componentId, "utf8"), componentId);
        return compileVooStyle({ ...component, id: componentId });
      }
      if (id.startsWith(`\0${rustStylePrefix}`)) {
        const payload = JSON.parse(decodeURIComponent(id.slice(rustStylePrefix.length + 1, -4)));
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
      if (id.endsWith(rustExtension)) {
        const contract = findRustContract(rustContracts, id, applicationRoot);
        if (contract) {
          return generateRustComponentModule(contract, framework, id);
        }
        const store = findRustStore(rustStores, id, applicationRoot);
        if (store) {
          return generateRustStoreModule(store, framework);
        }
        return null;
      }
      if (!id.endsWith(componentExtension)) return null;
      const component = parseVooComponent(readFileSync(id, "utf8"), id);
      if (component.format === "source") {
        component.id = id;
        const { exportName, disposeName, updateNames } = generatedComponentBinding(component);
        const definition = generatedAdapterDefinition(component);
        const adapter = framework === "react" ? "@vooya/react" : "@vooya/vue";
        return `
          ${component.style ? `import "${stylePrefix}${encodeURIComponent(id)}.css";` : ""}
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
          export default defineVooyaComponent(${JSON.stringify(definition)}, loadBindings);
        `;
      }
      const adapter = framework === "react" ? "@vooya/react" : "@vooya/vue";
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
      watchedRustRoots = [
        resolve(resolveRuntimeCrateRoot(), "src"),
        ...resolveRustDependencyRoots(rust, applicationRoot),
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

function formatBuildDuration(duration) {
  return `${Math.max(0, Math.round(duration))}ms`;
}

export function createRustBuildProgress(logger, now = () => performance.now()) {
  let startedAt;
  const elapsed = () => formatBuildDuration(now() - startedAt);
  return {
    start() {
      startedAt = now();
      logger?.info("Vooya: building Rust/WASM source…");
    },
    complete() {
      if (startedAt !== undefined) logger?.info(`Vooya: Rust/WASM build complete in ${elapsed()}.`);
    },
    fail() {
      if (startedAt !== undefined) logger?.info(`Vooya: Rust/WASM build failed after ${elapsed()}.`);
    },
  };
}

function isPathInside(file, directory) {
  const path = relative(directory, file);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

function isToolchainExecutionError(error) {
  return (
    (error && ["EACCES", "ENOENT", "EPERM"].includes(error.code)) ||
    (isVooyaUserError(error) && ["cargo-start", "wasm-bindgen"].includes(error.kind))
  );
}

function componentMetadata(component) {
  return {
    abiVersion: generatedAdapterDefinition(component).abiVersion,
    name: component.name,
    props: component.props,
    events: component.events,
  };
}

function findRustContract(contracts, file, applicationRoot) {
  const normalizedFile = file.replaceAll("\\", "/");
  return contracts.find((contract) => {
    const group = contract.component.group;
    if (!group) return false;
    const normalizedGroup = group.replaceAll("\\", "/");
    const groupCandidates = [
      normalizedGroup,
      normalizedGroup.replace(/^src\/rust\//, ""),
      normalizedGroup.replace(/^rust\//, ""),
    ];
    const resolvedGroup = isAbsolute(group) ? group : resolve(applicationRoot, group);
    return file === resolvedGroup || groupCandidates.some((candidate) =>
      normalizedFile.endsWith(`/${candidate}`) || candidate.endsWith(`/${normalizedFile}`));
  });
}

function findRustStore(stores, file, applicationRoot) {
  const normalizedFile = file.replaceAll("\\", "/");
  return stores.find((store) => {
    const group = store.group;
    if (!group) return false;
    const normalizedGroup = group.replaceAll("\\", "/");
    const groupCandidates = [
      normalizedGroup,
      normalizedGroup.replace(/^src\/rust\//, ""),
      normalizedGroup.replace(/^rust\//, ""),
    ];
    const resolvedGroup = isAbsolute(group) ? group : resolve(applicationRoot, group);
    return file === resolvedGroup || groupCandidates.some((candidate) =>
      normalizedFile.endsWith(`/${candidate}`) || candidate.endsWith(`/${normalizedFile}`));
  });
}

export function generateRustComponentModule(contract, framework = "vue", componentId = contract.component.group) {
  const name = contract.component.name;
  const stem = rustStem(name);
  const mount = `voo_${stem}_mount`;
  const update = `voo_${stem}_update_props`;
  const dispose = `voo_${stem}_dispose`;
  const props = contract.props?.fields ?? [];
  const events = contract.events?.methods ?? [];
  const styles = contract.component.styles ?? [];
  const styleImport = styles.length
    ? `import "${rustStylePrefix}${encodeURIComponent(JSON.stringify({ componentId, name, styles }))}.css";`
    : "";
  const scopeId = styles.some((style) => style.scoped)
    ? generatedScopeId({ id: componentId, name })
    : undefined;
  const definition = {
    abiVersion: 1,
    name,
    ...(scopeId ? { scopeId } : {}),
    props: props.map((prop) => ({
      name: prop.name,
      type: rustTypeToRuntimeType(prop.type),
      required: !/^Option\s*</.test(prop.type.replace(/\s+/g, "")),
    })),
    events: events.map((event) => ({ name: event.name, parameters: event.params.map((parameter) => parameter.name) })),
  };
  const propAssignments = props.map((prop, index) => `${JSON.stringify(prop.name)}: props[${index}]`).join(", ");
  const updates = props.map((prop) => `update_${rustProperty(prop.name)}(value) { currentProps[${JSON.stringify(prop.name)}] = value; ${update}(handle, currentProps); }`).join(",\n                      ");
  const adapter = framework === "react" ? "@vooya/react" : "@vooya/vue";
  return `${styleImport}
import init, { ${mount}, ${update}, ${dispose}, voo_abi_version } from "${runtimeId}";
import { defineVooyaComponent } from "${adapter}";
import { assertVooAbiVersion, initializeWasm } from "@vooya/vite/runtime";

let bindings;
async function loadBindings() {
  if (!bindings) {
    bindings = initializeWasm(init).then(() => {
      assertVooAbiVersion(voo_abi_version());
      return {
        mount(host, ...props) {
          let currentProps = { ${propAssignments} };
          const handle = ${mount}(host, currentProps);
          return {
            dispose() { ${dispose}(handle); },
            updateProps(values) { currentProps = { ...currentProps, ...values }; ${update}(handle, currentProps); },
            ${updates}
          };
        }
      };
    });
  }
  return bindings;
}

export const metadata = ${JSON.stringify({ name, props, events })};
export default defineVooyaComponent(${JSON.stringify(definition)}, loadBindings);
`;
}

export const generateRustVueModule = (contract) => generateRustComponentModule(contract, "vue");

export function generateRustStoreModule(store, framework = "vue") {
  const name = store.name.split("::").at(-1) ?? store.name;
  const stem = rustStem(name);
  const create = `voo_${stem}_store_create`;
  const snapshot = `voo_${stem}_store_snapshot`;
  const subscribe = `voo_${stem}_store_subscribe`;
  const unsubscribe = `voo_${stem}_store_unsubscribe`;
  const dispose = `voo_${stem}_store_dispose`;
  const actions = store.actions.map((action) => {
    const exportName = `voo_${stem}_store_${action.name}`;
    const parameters = action.params.map((parameter) => parameter.name).join(", ");
    return `${JSON.stringify(action.name)}(...args) { return ${exportName}(handle, ...args); }`;
  }).join(",\n      " );
  const imports = ["voo_abi_version", create, snapshot, subscribe, unsubscribe, dispose, ...store.actions.map((action) => `voo_${stem}_store_${action.name}`)];
  const adapter = framework === "react" ? "react" : "vue";
  const adapterImport = `import { useVooyaStore } from "@vooya/${adapter}";\n`;
  const hook = `\nexport function use${name}(options = {}) {\n  const consumed = ${adapter === "react"
    ? `useVooyaStore(create${name}Store, undefined, options)`
    : `useVooyaStore(create${name}Store(), { ...options, disposeOnUnmount: true })`};\n  return {\n    state: consumed.${adapter === "react" ? "state" : "snapshot"},\n    ${store.actions.map((action) => `${rustProperty(action.name)}: (...args) => ${adapter === "react" ? `consumed.store?.[${JSON.stringify(action.name)}](...args)` : `consumed.dispatch(${JSON.stringify(action.name)}, ...args)`}`).join(",\n    ")}\n  };\n}\n`;
  return `${adapterImport}import init, { ${imports.join(", ")} } from "${runtimeId}";
import { assertVooAbiVersion, initializeWasm } from "@vooya/vite/runtime";

let bindings;
async function loadBindings() {
  if (!bindings) {
    bindings = initializeWasm(init).then(() => {
      assertVooAbiVersion(voo_abi_version());
      return true;
    });
  }
  return bindings;
}

export async function create${name}Store() {
  await loadBindings();
  const handle = ${create}();
  const subscriptions = new Map();
  return {
    getSnapshot() { return ${snapshot}(handle); },
    subscribe(listener) {
      const id = ${subscribe}(handle, listener);
      subscriptions.set(id, listener);
      return () => {
        if (subscriptions.delete(id)) ${unsubscribe}(handle, id);
      };
    },
    ${actions}${actions ? "," : ""}
    dispose() {
      for (const id of subscriptions.keys()) ${unsubscribe}(handle, id);
      subscriptions.clear();
      ${dispose}(handle);
    },
  };
}
${hook}

export default create${name}Store;
export const metadata = ${JSON.stringify({ name, actions: store.actions, snapshot: store.snapshot ?? null })};
`;
}

export const generateRustVueStoreModule = (store) => generateRustStoreModule(store, "vue");

function rustStem(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[^A-Za-z0-9_]/g, "_").toLowerCase();
}

function rustProperty(name) {
  return name.replace(/[^A-Za-z0-9_$]/g, "_");
}
