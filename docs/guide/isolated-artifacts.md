# Independently loaded Rust artifacts

This unreleased source capability addresses applications with a small Store and
heavy Rust capabilities on different routes. The default remains one
application-local WASM artifact. Opt in with `rust.artifacts` to create an
independent Cargo crate, target cache, bindings and WASM file for each named unit.
The shared Rust provider owns the build plan; Vite consumes it. Other bundler
integrations currently reject this option instead of silently merging the units.

```js
import { vooya } from "@vooya/vite";

export default {
  plugins: [vooya({ rust: { artifacts: {
    light: { sourceRoot: "src/light" },
    simulation: {
      sourceRoot: "src/simulation",
      dependencies: {
        bevy_ecs: { version: "=0.18.1", defaultFeatures: false, features: ["std"] },
      },
    },
  } } })],
};
```

Each unit requires a non-overlapping source directory inside the application.
Put `entry`, `files` and `public` inside the owning unit; entry/files must stay
inside that directory. Ordinary Rust module discovery and authored crate entry
rules remain unchanged. Names use lowercase letters, digits and hyphens, and
must begin with a letter. Share source between units through Cargo dependencies.

Dependencies beside `artifacts` are explicit defaults shared by every unit.
Each unit also follows the normal nearest-Cargo-manifest lookup from its own
source directory; use a unit-local manifest or its own `dependencies` for heavy
crates. A heavy dependency inherited from a common parent manifest still belongs
to every inheriting crate. Dependencies are not automatically split by usage.

## Load a capability on demand

Keep the heavy entry behind the host application's dynamic route import:

```ts
async function openSimulation() {
  const { createSimulationStore } = await import("./simulation/Simulation.rs");
  const store = await createSimulationStore();
  const unsubscribe = store.subscribe(() => render(store.getSnapshot()));
  return () => {
    unsubscribe();
    store.dispose();
  };
}
```

Here `render` is the application's own rendering callback. Static imports still
load their owning artifact eagerly. Dynamic imports isolate browser loading;
the production build still compiles every configured unit. Framework bridges
import only their owning WASM bindings. Type declarations stay in the normal
`.vooya/types` tree, but each artifact's conversion identities are resolved
separately, even when Rust types or Stores share the same name.

WASM initialization is cached per generated module. Revisiting a route reuses
that module but creates a fresh Store when its factory is called. Dispose the
old instance when leaving; its state, listeners and handles belong to that
instance. Disposing a Store does not unload the browser's cached WASM module.
Shared Rust dependencies and runtime code can be duplicated across artifacts;
choose capability-sized units rather than one artifact per component.

## Development and measurement

Generated builds live under `.vooya/artifacts/<name>/` by default, or
`<workspace.root>/artifacts/<name>/` when a workspace root is configured. Editing an authored
source rebuilds its unit. Editing a shared Cargo dependency or inherited manifest
can rebuild multiple units. Failed units retain their last successful WASM and
are retried after subsequent edits; source diagnostics point to authored files.
Successful rebuilds use the existing full-page reload contract, without
preserving Rust state. Configuration changes use Vite's normal server restart.

Production emits `vooya-artifacts.json` with each artifact's WASM byte size,
output asset names, owning chunks, and the chunks' static/dynamic import edges.
Use this together with browser request records to detect payload regressions;
raw WASM size alone is not a startup-time benchmark.

`npm run test:rust-artifacts` installs fresh package tarballs and checks a light
Store and a Bevy ECS Store on Vite 7 and 8: strict generated types, independent Cargo inputs,
production lazy requests and initialization, route disposal/remount, development
rebuild isolation, authored diagnostics and recovery. This does not establish a
published precompiled component format or multi-artifact support in other
bundlers. The existing single-artifact path remains unchanged.
