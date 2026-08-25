import {
  generatedAdapterDefinition,
  generatedComponentBinding,
  type SourceComponent,
} from "@vooya/compiler";

export function renderVooModule({
  component,
  framework,
  runtimeModule,
  styleModule,
}: {
  component: SourceComponent;
  framework: "vue" | "react";
  runtimeModule: string;
  styleModule?: string;
}): string {
  const { exportName, disposeName, updateNames } = generatedComponentBinding(component);
  const definition = generatedAdapterDefinition(component);
  const adapter = framework === "react" ? "@vooya/react" : "@vooya/vue";
  const updates = Object.entries(updateNames)
    .map(([prop, name]) => `update_${prop}(value) { ${name}(handle, value); }`)
    .join(",\n      ");

  return `${styleModule ? `import ${JSON.stringify(styleModule)};` : ""}
import init, { ${[exportName, disposeName, ...Object.values(updateNames), "voo_abi_version"].join(", ")} } from ${JSON.stringify(runtimeModule)};
import { defineVooyaComponent } from ${JSON.stringify(adapter)};
import { assertVooAbiVersion, initializeWasm } from "@vooya/webpack/runtime";

let bindings;
async function loadBindings() {
  if (!bindings) {
    bindings = initializeWasm(init).then(() => {
      assertVooAbiVersion(voo_abi_version(), ${definition.abiVersion});
      return {
        mount(host, ...props) {
          const handle = ${exportName}(host, ...props);
          return {
            dispose() { ${disposeName}(handle); },
            ${updates}
          };
        }
      };
    });
  }
  return bindings;
}

export const metadata = ${JSON.stringify({
    abiVersion: definition.abiVersion,
    name: component.name,
    props: component.props,
    events: component.events,
  })};
export default defineVooyaComponent({
  contract: ${JSON.stringify(definition)},
  loadBindings,
});
`;
}
