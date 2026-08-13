# Vooya

**A browser component-island implementation of the Vooya approach: keep
JavaScript, and move only a focused workload.**

Vooya lets a `.voo` component own one isolated DOM subtree while Vue or React
continues to own the surrounding application tree, routing, and business state.
It is an alpha compiler for teams that want to use Rust/WASM where a local
component has enough interaction or computation to justify the boundary—without
rewriting the rest of their application.

```vue
<script setup lang="ts">
import Counter from "./Counter.voo";
</script>

<template>
  <Counter :initial="1" @change="value => console.log(value)" />
</template>
```

## What is in the repository

| Start here | What it demonstrates |
| --- | --- |
| [Vue counter](examples/vue-counter) | Source `.voo`, typed props/events, styles, and lifecycle behavior |
| [React counter](examples/react-counter) | The same source-component boundary through React 19 |
| [Task list](examples/task-list) | Rust-owned reactive state and keyed rows |
| [150k-point scatter plot](examples/scatter-plot) | Rust-owned Canvas rendering, point updates, and zoom |
| [Trace waterfall](examples/trace-waterfall) | A dense diagnostic island with a same-workload Vue baseline |
| [Data-grid benchmark](examples/data-grid-benchmark) | A documented, approximately-parity benchmark—not a WASM speed claim |

## Quick start

Source `.voo` authors need Rust, the WASM target, and the matching
`wasm-bindgen` CLI:

```sh
npm install
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.115 --locked
npx vooya doctor
npm run dev:vue
```

For a component contract, Rust implementation, and optional scoped style in one
file, see [Writing `.voo` components](docs/guide/voo-components.md). For a
step-by-step Vue or React setup, see [Getting started](docs/guide/getting-started.md).

## The boundary

```text
Vue / React props -> generated adapter -> WASM component -> owned DOM subtree
Vue / React events <- generated adapter <- component events
unmount            -> dispose           -> release state and listeners
```

The host framework owns the mount element and its place in the app. A Vooya
component owns the nodes beneath it. This is not a replacement for Vue, React,
routing, or application state management.

Vooya is one browser-side realization of a broader approach: preserve the
familiar JavaScript application surface, then move only a bounded, expensive or
environment-specific workload to an implementation better suited to it. The
component boundary is the island in this repository; it does not require moving
the whole application to Rust.

## Current alpha capabilities

- Compile Rust from `<rust>` blocks into application-level WASM.
- Import a `.voo` component through Vite as a Vue 3 or React 19 component.
- Generate prop update, event, dispose, ABI, TypeScript declaration, and scoped
  CSS plumbing.
- Map extracted Rust diagnostics back to the original `.voo` source lines.
- Build a Vue precompiled-artifact reference path whose consumer does not need
  Rust tooling.
- Exercise source components through automated browser tests, including a
  Firefox Vue path.

## Honest limits

- Source component authors need Cargo, `wasm32-unknown-unknown`, and
  `wasm-bindgen-cli`.
- React precompiled-artifact consumption is not implemented.
- SSR, hydration, slots, and standalone rendering are out of scope.
- Contracts currently support primitive prop and event values.
- Rust rebuilds perform a full page reload; state-preserving HMR is not defined.
- Alpha ABI revisions can be breaking; install coordinated `@vooya` package
  versions together.

WASM is not assumed to make ordinary DOM work faster. The current 100k data-grid
result is [approximately at parity with Vue](docs/benchmarks/2026-07-data-grid.md).
The trace-waterfall example likewise describes a measurement design rather than
a performance conclusion.

## Documentation and community

- [Documentation index](docs/README.md)
- [Component ownership boundary](docs/concepts/component-boundary.md)
- [Tooling reference](docs/reference/tooling.md)
- [Compatibility evidence](docs/project/compatibility.md)
- [Project status](docs/project/status.md)
- [GitHub Discussions](https://github.com/orgs/vooyajs/discussions)
- [Issues](https://github.com/vooyajs/vooya/issues)

Before opening a contribution, read the repository's [development checks](#development).
Bug reports should include a minimal `.voo` file, framework/Vite version, and
the diagnostic or browser behavior observed.

## Development

Run a focused example:

```sh
npm run dev:tasks
npm run dev:scatter
npm run dev:trace
```

Run the principal verification paths:

```sh
npm run test:compiler
npm run test:voo
npm run typecheck
npm run typecheck:react
npm run test:e2e
npm run test:artifact
```

Format source components with `npx voo-format src`, or check formatting with
`npx voo-format --check src`.

## Packages

The coordinated alpha release currently contains `@vooya/compiler`,
`@vooya/core`, `@vooya/vite-plugin`, `@vooya/vue`, `@vooya/react`, and
`@vooya/artifact-vue-counter`. See the [tooling reference](docs/reference/tooling.md)
for their roles and [RFC 0003](docs/rfcs/0003-production-readiness.md) for the
release-unit and ABI rules.

## License

Vooya is available under the [MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE)
license, at your option.
