<h1 align="center">Vooya</h1>

<p align="center">
  <strong>Write Rust-powered components for web applications.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@vooya/vite"><img src="https://img.shields.io/npm/v/@vooya/vite/alpha?label=alpha" alt="npm alpha version"></a>
  <a href="https://github.com/vooyajs/vooya/actions/workflows/verify.yml"><img src="https://github.com/vooyajs/vooya/actions/workflows/verify.yml/badge.svg?branch=main" alt="build status"></a>
  <a href="LICENSE-MIT"><img src="https://img.shields.io/github/license/vooyajs/vooya" alt="license"></a>
  <a href="https://deepwiki.com/vooyajs/vooya"><img src="https://deepwiki.com/badge.svg" alt="Ask DeepWiki"></a>
</p>

Vooya compiles Rust component and store files into WebAssembly and exposes
them through host-framework adapters for use in web applications. Rust-file
authoring uses ordinary `.rs` files; the older `.voo` component path remains
available for legacy projects and experimental fixtures only. The application shell keeps
routing and surrounding UI; Rust owns one isolated component surface. Vue and
React are the current first-party adapters.

```vue
<script setup lang="ts">
import RustChart from "./RustChart.rs";
</script>

<template>
  <RustChart :points="150000" @select="handleSelect" />
</template>
```

The component contract, Rust implementation, and scoped styles live together.
Vooya generates the framework adapter, TypeScript declarations, WASM lifecycle,
event forwarding, and diagnostic mappings.

> [!IMPORTANT]
> Vooya is a public alpha. Rust-file (`.rs`) authoring targets Vite `>=7 <9`, with
> experimental Rspack `>=2.1.10` and Webpack `>=5` paths. The legacy `.voo`
> source path is retained for existing fixtures and projects, not as the default
> authoring path. Both paths require a local
> Rust/WASM toolchain.
> Published alpha APIs may still change.

## Why Vooya?

Rust already has strong libraries for parsing, graphics, simulation, search,
editors, media, and data processing. Bringing one of those libraries into an
existing web application usually means maintaining WASM initialization,
framework wrappers, types, events, cleanup, diagnostics, and packaging by hand.

Vooya is exploring a repeatable component boundary for that work:

- keep existing web applications and framework choices;
- reuse browser-compatible Rust crates;
- generate typed props and events;
- manage mount, updates, failures, and disposal;
- develop from a single Rust-file component or store;
- eventually distribute precompiled components whose consumers do not need
  Rust installed.

Vooya is not a replacement for the application framework, and it does not
assume that WASM makes ordinary DOM work faster. Performance claims belong to
measured, component-level workloads.

## Quick start with Vue

### 1. Prerequisites

- Node.js `^20.19.0` or `>=22.12.0`;
- a current stable Rust toolchain managed by [rustup](https://rustup.rs/);
- the `wasm32-unknown-unknown` target;
- `wasm-bindgen-cli` `0.2.115` for the current alpha.

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.115 --locked
```

### 2. Create a Vite application

The current Vooya alpha requires Vite `>=7`. This guide pins the currently
verified Vite 8 toolchain so the generated project matches the example.

Using npm:

```sh
npm create vite@8 vooya-demo -- --template vue-ts
cd vooya-demo
npm install
npm install @vooya/vue@alpha
npm install --save-dev @vooya/vite@alpha
```

Using pnpm:

```sh
pnpm create vite@8 vooya-demo --template vue-ts
cd vooya-demo
pnpm install
pnpm add @vooya/vue@alpha
pnpm add --save-dev @vooya/vite@alpha
```

If pnpm reports that the `esbuild` install script was blocked, run
`pnpm approve-builds`, select `esbuild`, and repeat the install. This is pnpm's
dependency-script policy, not a Vooya compiler error.

### 3. Enable the plugin

Update `vite.config.ts`:

```ts
import vue from "@vitejs/plugin-vue";
import { vooya } from "@vooya/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue(), vooya()],
});
```

Check the exact Rust toolchain Vooya will select for Vite:

```sh
npm exec -- vooya doctor
# or: pnpm exec vooya doctor
```

For a TypeScript application, add the generated declaration root to the
application config used by `tsc` or `vue-tsc` (normally `tsconfig.app.json` in
a new Vite project):

```json
{
  "compilerOptions": {
    "allowArbitraryExtensions": true,
    "rootDirs": [".", ".vooya/types"]
  }
}
```

Vooya does not rewrite project configuration automatically. `vooya doctor`
reports the required change when it finds an incomplete TypeScript config.

### 4. Create your first component

Create `src/Greeting.rs`:

```rust
use wasm_bindgen::JsValue;
use vooya as voo;

#[voo::props]
#[derive(voo::FromJs)]
pub struct GreetingProps {
    pub name: String,
}

#[voo::component]
pub fn Greeting(
    view: &voo::View,
    props: GreetingProps,
) -> Result<voo::ViewElement, JsValue> {
    let label = format!("Hello, {}.", props.name);
    voo::rsx!(view, <p class="greeting">{label}</p>)
}
```

Put optional styles in `src/Greeting.css` and declare them with
`#[voo::style("./Greeting.css", scoped)]` on the component. The bundler owns
CSS loading and HMR; CSS is not embedded in WASM.

Replace `src/App.vue` with:

```vue
<script setup lang="ts">
import Greeting from "./Greeting.rs";
</script>

<template>
  <main>
    <h1>Vue hosts the application</h1>
    <Greeting name="Vooya" />
  </main>
</template>
```

Start Vite:

```sh
npm run dev
# or: pnpm dev
```

The first run creates a disposable `.vooya/` workspace, compiles the Rust
source to WASM, and mirrors the component declaration under `.vooya/types`.
Run `npm exec -- vooya clean` whenever you want to reconstruct all generated
state.

## Using React

Create a Vite 8 React project and install the React adapter:

```sh
npm create vite@8 vooya-react-demo -- --template react-ts
cd vooya-react-demo
npm install
npm install @vooya/react@alpha
npm install --save-dev @vooya/vite@alpha
```

Use the React mode in `vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { vooya } from "@vooya/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), vooya({ framework: "react" })],
});
```

The same `Greeting.rs` can then be imported from React:

```tsx
import Greeting from "./Greeting.rs";

export default function App() {
  return <Greeting name="Vooya" />;
}
```

## Using Rust libraries

Additional Cargo dependencies are configured in the Vite plugin. Registry,
Git, feature, and application-relative path dependencies are supported:

```ts
vooya({
  rust: {
    dependencies: {
      serde: { version: "1", features: ["derive"] },
      "shared-engine": { path: "rust/shared-engine" },
    },
    webSysFeatures: ["HtmlCanvasElement", "CanvasRenderingContext2d"],
  },
});
```

The crate must compile for `wasm32-unknown-unknown` and be compatible with the
browser environment. Crates that require native operating-system APIs, an
ordinary filesystem, or unsupported threading facilities will need a Web/WASM
compatible configuration or adapter.

## Component boundary

```text
Vue / React props  -> generated adapter -> Rust/WASM component
Vue / React events <- generated adapter <- typed component events
framework unmount  -> dispose           -> listeners and resources released
```

The framework owns the host element and its location in the application tree.
The mounted Vooya component owns the subtree below that element. Rust can use
the small structured `View` API, Canvas/WebGL, or lower-level `web-sys` browser
APIs when necessary.

## What works today

- Rust-file (`.rs`) components and stores in Vite `>=7`;
- legacy source `.voo` components in Vite `>=7` for existing projects;
- experimental source `.voo` components in Rspack `>=2.1.10` through Rsbuild
  or the first-party Rspack plugin;
- experimental source `.voo` components in Webpack `>=5`;
- Vue `>=3.5.2` and React `>=19` adapters;
- typed ABI v1 props, events, and store actions;
- generated mount, prop-update, error, dispose, and ABI bindings;
- TypeScript declarations and scoped CSS;
- Rust diagnostics mapped back to `.rs` and legacy `.voo` source lines;
- crates.io, Git, feature, and watched path dependencies;
- failed-build recovery and reliable full-page reload after Rust rebuilds;
- `vooya doctor`, `.voo` formatting, and a VS Code diagnostics extension;
- browser fixtures for lifecycle cleanup, DataGrid, Canvas scatter, and trace
  waterfall examples;
- a test-only precompiled Vue consumer proof that runs without Rust tools.

### Compatibility at a glance

| Layer | Minimum version | Status | Exact evidence |
| --- | --- | --- | --- |
| Node.js | `^20.19.0 \|\| >=22.12.0` | supported | Source quickstarts run on Ubuntu + Node 20, macOS + Node 22, and Windows + Node 22; the release gate also runs on Ubuntu + Node 22 |
| Vue | `>=3.5.2` | supported | adapter checks through 3.5.41; browser fixtures at 3.5.40/3.5.41 |
| React | `>=19` | supported | browser fixtures at 19.0.0 and 19.2.0 |
| Vite | `>=7` | supported | repository Vite 7 path and packed Vite 8.2.1 fixture |
| Vite+ | `>=0.2.9` | tested only | Vite-core alias production smoke at 0.2.9 |
| Rspack / Rsbuild | Rspack `>=2.1.10`; Rsbuild `>=2.1.13` | experimental | Rspack 2.1.10 with Rsbuild, Rslib, and native Rspack fixtures |
| Webpack | `>=5` | experimental | production fixture at 5.101.0; Vue/React browser and watch recovery at 5.109.2 |

“Supported” and “experimental” describe Vooya's tested integration boundary,
not every feature of the host framework or bundler. See the detailed
[compatibility matrix](docs/project/compatibility.md) before relying on SSR,
hydration, HMR state preservation, Vue Vapor, or a toolchain not listed here.

Current boundaries:

- Rspack support is experimental; exact evidence comes from the recorded
  fixtures, and Vite+ remains a Vite-core alias rather than a second adapter;
- Webpack 5 support is experimental; Webpack 4, Turbopack, Rollup, SSR, and
  hydration are not supported;
- successful Rust HMR currently performs a full reload and loses local state;
- component contracts are intentionally limited and will evolve during alpha;
- the precompiled artifact path is not yet a published component product.

See the [project status](docs/project/status.md) and
[compatibility matrix](docs/project/compatibility.md) for the precise evidence
behind these statements.

## Documentation

- [Getting started](docs/guide/getting-started.md)
- [Rust-file authoring](docs/guide/rust-file-authoring.md)
- [Writing `.voo` components](docs/guide/voo-components.md)
- [Component ownership boundary](docs/concepts/component-boundary.md)
- [Tooling and Rust dependencies](docs/reference/tooling.md)
- [Project status](docs/project/status.md)
- [Compatibility matrix](docs/project/compatibility.md)
- [Design RFCs](docs/README.md#design-records)

## Examples

After cloning this repository and installing its dependencies, run:

```sh
npm install
npm run dev:vue       # Vue counter
npm run dev:react     # React counter
npm run dev:tasks     # Rust-owned task list
npm run dev:scatter   # 150,000-point Canvas scatter plot
npm run dev:benchmark # Rust/Vue data-grid comparison
npm run dev:trace     # trace-waterfall interaction case
```

Repository development also requires the Rust target and pinned wasm-bindgen
CLI shown in the quick start above.

## Packages

| Package | Purpose |
| --- | --- |
| [`@vooya/compiler`](packages/compiler) | Pure `.voo` parser, IR, code generation, formatting, and scoped styles |
| [`@vooya/core`](packages/core) | Rust component runtime source and ownership primitives |
| [`@vooya/build-core`](packages/build-core) | Bundler-neutral Cargo, wasm-bindgen, asset, declaration, watch, and diagnostic pipeline |
| [`@vooya/vite`](packages/vite) | Vite integration, Rust/WASM build orchestration, diagnostics, and CLI |
| [`@vooya/rspack`](packages/rspack) | Experimental Rspack `>=2.1.10` and Rsbuild source `.voo` integration |
| [`@vooya/webpack`](packages/webpack) | Experimental Webpack `>=5` source `.voo` integration |
| [`@vooya/vue`](packages/vue) | Vue lifecycle and event adapter |
| [`@vooya/react`](packages/react) | React lifecycle and event adapter |

All public packages use one coordinated alpha version. Install the framework
adapter and selected bundler integration from the same `alpha` channel.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for project
scope, development setup, testing guidance, and pull request expectations.

## License

Vooya is dual-licensed under [MIT](LICENSE-MIT) or
[Apache-2.0](LICENSE-APACHE).
