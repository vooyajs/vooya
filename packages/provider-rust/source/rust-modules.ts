import { generatedScopeId } from "@vooya/compiler";
import { rustTypeToRuntimeType } from "./schema-declarations.js";
import type { RustComponentContract, RustStoreSchema } from "./schema.js";

export type RustModuleFramework = "vue" | "react" | "solid" | "svelte" | "octane";

/** Bundlers supply resolved artifact locations; emitted modules only load WASM on demand. */
export interface RustModuleOptions {
  runtimeModule: string;
  runtimeHelpers: string;
  styleModule?: string;
}

export function renderRustComponentModule(contract: RustComponentContract, framework: RustModuleFramework, componentId: string, options: RustModuleOptions): string {
  const name = contract.component.name;
  const stem = rustStem(name);
  const mount = `voo_${stem}_mount`;
  const update = `voo_${stem}_update_props`;
  const dispose = `voo_${stem}_dispose`;
  const props = contract.props?.fields ?? [];
  const events = contract.events?.methods ?? [];
  const styles = contract.component.styles ?? [];
  const styleImport = options.styleModule ? `import ${JSON.stringify(options.styleModule)};` : "";
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
  const adapter = `@vooya/${framework}`;
  return `${styleImport}
import init, { ${mount}, ${update}, ${dispose}, voo_abi_version } from ${JSON.stringify(options.runtimeModule)};
import { defineVooyaComponent } from "${adapter}";
import { assertVooAbiVersion, initializeWasm } from ${JSON.stringify(options.runtimeHelpers)};

let bindings;
async function loadBindings() {
  if (!bindings) {
    bindings = initializeWasm(init).then(() => {
      assertVooAbiVersion(voo_abi_version(), 1);
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
    }).catch((cause) => {
      bindings = undefined;
      throw cause;
    });
  }
  return bindings;
}

export const metadata = ${JSON.stringify({ name, props, events })};
export default defineVooyaComponent({
  contract: ${JSON.stringify(definition)},
  loadBindings,
});
`;
}


export function renderRustStoreModule(store: RustStoreSchema, framework: RustModuleFramework, options: RustModuleOptions): string {
  const name = store.name.split("::").at(-1) ?? store.name;
  const stem = rustStem(name);
  const create = `voo_${stem}_store_create`;
  const snapshot = `voo_${stem}_store_snapshot`;
  const subscribe = `voo_${stem}_store_subscribe`;
  const unsubscribe = `voo_${stem}_store_unsubscribe`;
  const dispose = `voo_${stem}_store_dispose`;
  const actions = store.actions.map((action) => {
    const exportName = `voo_${stem}_store_${action.name}`;
    return `${JSON.stringify(action.name)}(...args) { return ${exportName}(handle, ...args); }`;
  }).join(",\n      " );
  const imports = ["voo_abi_version", create, snapshot, subscribe, unsubscribe, dispose, ...store.actions.map((action) => `voo_${stem}_store_${action.name}`)];
  const adapter = framework;
  const adapterImport = `import { defineVooyaStore } from "@vooya/${adapter}";\n`;
  return `${adapterImport}import init, { ${imports.join(", ")} } from ${JSON.stringify(options.runtimeModule)};
import { assertVooAbiVersion, initializeWasm } from ${JSON.stringify(options.runtimeHelpers)};

let bindings;
async function loadBindings() {
  if (!bindings) {
    bindings = initializeWasm(init).then(() => {
      assertVooAbiVersion(voo_abi_version(), 1);
      return true;
    }).catch((cause) => {
      bindings = undefined;
      throw cause;
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

const storeBridge = {
  name: ${JSON.stringify(name)},
  create: create${name}Store,
  actions: ${JSON.stringify(store.actions.map((action) => action.name))},
};

export const use${name} = defineVooyaStore(storeBridge);

export default create${name}Store;
export const metadata = ${JSON.stringify({ name, actions: store.actions, snapshot: store.snapshot ?? null })};
`;
}


function rustStem(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[^A-Za-z0-9_]/g, "_").toLowerCase();
}

function rustProperty(name: string): string {
  return name.replace(/[^A-Za-z0-9_$]/g, "_");
}
