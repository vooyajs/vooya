// Rspack loads this file as an ESM loader. It intentionally owns only the
// framework wrapper; Rust/WASM compilation is performed by build-core in the plugin.
// @ts-nocheck
import { parseVooComponent } from "@vooya/compiler";

import { renderVooModule } from "./module.js";
import { getBuildState } from "./state.js";

export default function vooyaRspackLoader(source) {
  // The rendered wrapper includes the plugin's current in-memory WASM build
  // identity, so it is not a pure function of the .voo source alone. Rspack's
  // persistent loader cache can otherwise retain the wrapper from the last
  // successful compilation after a Rust failure/recovery cycle.
  this.cacheable(false);
  const { framework = "vue", instanceId } = this.getOptions();
  const state = getBuildState(instanceId);
  if (!state) {
    throw new Error("Vooya Rspack loader ran before its build plugin prepared the Rust/WASM artifact.");
  }
  this.addDependency(this.resourcePath);
  if (this.resourcePath.endsWith(".rs")) {
    const module = state.rustModules.get(this.resourcePath);
    if (!module) throw new Error(`No Vooya component or store found for ${this.resourcePath}. Check rust.sourceRoot and avoid mixing legacy .voo and Rust-file authoring in one application.`);
    return module;
  }
  const component = parseVooComponent(source.toString(), this.resourcePath);
  if (component.format !== "source") {
    throw new Error(`Rspack source integration requires a source .voo component, received ${component.format}.`);
  }
  component.id = this.resourcePath;
  this.addDependency(this.resourcePath);
  return renderVooModule({
    component,
    framework,
    runtimeModule: state.runtimeModule,
    styleModule: state.styleModules.get(this.resourcePath),
  });
}
