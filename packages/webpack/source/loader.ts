// Webpack loads this file through its public loader protocol. Rust/WASM
// compilation remains in the plugin and shared build core.
// @ts-nocheck
import { parseVooComponent } from "@vooya/compiler";

import { renderVooModule } from "./module.js";
import { getBuildState } from "./state.js";

export default function vooyaWebpackLoader(source) {
  // The wrapper includes the current generated runtime path, so it must not be
  // restored from Webpack's persistent loader cache after a Rust rebuild.
  this.cacheable(false);
  const { framework = "vue", instanceId } = this.getOptions();
  const state = getBuildState(instanceId);
  if (!state) {
    throw new Error(
      "Vooya Webpack loader ran before its build plugin prepared the Rust/WASM artifact.",
    );
  }
  // The source module can remain byte-for-byte identical while a Rust
  // dependency produces a new WASM runtime. Depend on the stable generation
  // marker so Webpack reruns this loader and points at the latest runtime.
  this.addDependency(state.generationFile);
  const component = parseVooComponent(source.toString(), this.resourcePath);
  if (component.format !== "source") {
    throw new Error(
      `Webpack source integration requires a source .voo component, received ${component.format}.`,
    );
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
