// Vite supplies hook contexts dynamically. The public plugin implementation
// is TypeScript-authored; its Vite hook boundary remains intentionally loose.
// @ts-nocheck
import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import {
  buildApplication,
  clearToolchainCache,
  formatResolvedToolchain,
  isVooyaUserError,
  resolveVooyaWorkspace,
  resolveRuntimeCrateRoot,
  resolveRustDependencyRoots,
  resolveToolchain,
  writeVooDeclarations,
} from "@vooya/build-core";
import { createBuildScheduler } from "./build-scheduler.js";
import {
  compileVooStyle,
  generatedAdapterDefinition,
  generatedComponentBinding,
  parseVooComponent,
} from "@vooya/compiler";
import { readVooComponents } from "./voo-project.js";
import { inspectGeneratedTypesConfiguration } from "./typescript-config.js";

const componentExtension = ".voo";
const runtimeId = "virtual:vooya-runtime";
const stylePrefix = "virtual:vooya-style:";

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
  let watchedRustRoots = [];
  let logger;

  const handleVooyaHotUpdate = ({ file }) => {
    if (
      !file.endsWith(componentExtension) &&
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
    writeVooDeclarations({
      applicationRoot,
      components,
      framework,
      workspaceRoot: workspaceOptions.root,
    });
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
      ({ runtimeModule } = buildApplication({
        applicationRoot,
        components: sourceComponents,
        rust,
        framework,
        workspaceRoot: resolveVooyaWorkspace(applicationRoot, workspaceOptions.root).root,
        toolchain,
        onRustBuildStart: progress.start,
      }));
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
      if (!source.endsWith(componentExtension) || !importer) return null;
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
    // Vite 7 uses `hotUpdate`; keep the legacy hook for Vite 6 consumers.
    hotUpdate: handleVooyaHotUpdate,
    handleHotUpdate: handleVooyaHotUpdate,
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
