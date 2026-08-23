# Getting Started

Vooya currently targets existing Vite `>=7` applications using Vue `>=3.5.2`
or React `>=19`. Rust-file components and stores use ordinary `.rs` files and
are compiled on the application author's machine, so both the JavaScript and
Rust toolchains are required.

This guide covers the supported source-authoring path. Vooya does not currently
publish a user-facing precompiled component product. The repository's test-only
precompiled Vue consumer is build-contract evidence, so the Rust/WASM
prerequisites below apply to source authoring.

## Prerequisites

- A Node.js version supported by your Vite version (`^20.19.0` or `>=22.12.0`
  for Vite 8).
- A current stable Rust toolchain.
- The `wasm32-unknown-unknown` Rust target.
- `wasm-bindgen-cli` version `0.2.115` for the current alpha runtime.

### Windows MSVC prerequisite

If Rust reports a host ending in `-pc-windows-msvc`, install Visual Studio Build
Tools before installing `wasm-bindgen-cli`. Select the **Desktop development with
C++** workload, including MSVC C++ build tools and a Windows SDK. Cargo needs the
MSVC linker, `link.exe`, to compile the CLI. Reopen the terminal after installation
so the linker is available on `PATH`.

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.115 --locked
wasm-bindgen --version
```

After installing the Vite plugin, verify the exact toolchain that Vooya will
select for Vite:

```sh
npm exec -- vooya doctor
```

The command checks a coherent Cargo-selected toolchain: `cargo`, the exact
`rustc` that Cargo invokes, the `wasm32-unknown-unknown` target, and the pinned
`wasm-bindgen` CLI. On Windows MSVC toolchains, it also checks for `link.exe`.
It reports the selected executable paths, warns when the active Rust sysroot is
not managed by rustup, and warns when it had to select a later Cargo than the
first Cargo on `PATH`. To explicitly select Cargo in the Vite plugin, configure
`toolchain.cargoPath`; to inspect that choice from the CLI, pass the same path
with `vooya doctor --cargo-path <path>`.

All `@vooya` packages must use the same alpha version. The repository `main`
branch can lead the npm `alpha` tag while a breaking prerelease is being
prepared; do not mix source from `main` with older published adapters.

## npm and pnpm

The examples below show both npm and pnpm commands.

pnpm 11 may block dependency install scripts until they are explicitly
approved. If pnpm reports that the `esbuild` build was ignored, approve
`esbuild` specifically:

```sh
pnpm approve-builds esbuild
```

Only do this when pnpm reports `esbuild` as blocked. The approval allows
esbuild's install script to run. esbuild uses that script to verify or install
the platform-specific native executable for the current system.
Do not approve unrelated packages merely to remove the warning.

You can inspect packages whose build scripts are currently blocked with:

```sh
pnpm ignored-builds
```

## Vue

Install the Vue adapter and Vite plugin in an existing Vue application. The
application must already depend on `vue`, `vite`, and `@vitejs/plugin-vue`.

npm:

```sh
npm install @vooya/vue@alpha
npm install --save-dev @vooya/vite@alpha
```

pnpm:

```sh
pnpm add @vooya/vue@alpha
pnpm add --save-dev @vooya/vite@alpha
```

Add `vooya()` after the Vue plugin:

```js
import vue from "@vitejs/plugin-vue";
import { vooya } from "@vooya/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue(), vooya()],
});
```

Continue to [Verify before the first dev run](#verify-before-the-first-dev-run)
before starting Vite.

## React

Install the React adapter and Vite plugin.

npm:

```sh
npm install @vooya/react@alpha
npm install --save-dev @vooya/vite@alpha
```

pnpm:

```sh
pnpm add @vooya/react@alpha
pnpm add --save-dev @vooya/vite@alpha
```

Select the React adapter in Vite:

```js
import react from "@vitejs/plugin-react";
import { vooya } from "@vooya/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), vooya({ framework: "react" })],
});
```

Continue to [Verify before the first dev run](#verify-before-the-first-dev-run)
before starting Vite.

## Verify before the first dev run

Before starting Vite for the first time, verify the exact toolchain Vooya will
select.

npm:

```sh
npm exec -- vooya doctor
```

pnpm:

```sh
pnpm exec vooya doctor
```

The command checks a coherent Cargo-selected toolchain: `cargo`, the exact
`rustc` that Cargo invokes, the `wasm32-unknown-unknown` target, and the pinned
`wasm-bindgen` CLI. On Windows MSVC toolchains, it also checks for `link.exe`.
It reports the executable paths, warns when a later Cargo than the first PATH
candidate is selected, and warns when the active Rust sysroot is not managed by
rustup. To inspect an explicit plugin selection, pass the same path with
`vooya doctor --cargo-path <path>`.

If the doctor reports a Rust or WASM problem, return to
[Prerequisites](#prerequisites) before starting the development server.

For TypeScript projects, configure the tsconfig used by the application
(normally `tsconfig.app.json` in a new Vite project):

```json
{
  "compilerOptions": {
    "allowArbitraryExtensions": true,
    "rootDirs": [".", ".vooya/types"]
  }
}
```

Vooya mirrors declarations under `.vooya/types` so source directories remain
clean. The plugin cannot silently change the configuration used by `tsc`,
`vue-tsc`, or an editor language service; `vooya doctor` reports an actionable
warning when it finds an incomplete TypeScript config.

Run the application's normal Vite scripts after the doctor passes.

npm:

```sh
npm run dev
npm run build
```

pnpm:

```sh
pnpm run dev
pnpm run build
```

## First component

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
#[voo::style("./Greeting.css", scoped)]
pub fn Greeting(
    view: &voo::View,
    props: GreetingProps,
) -> Result<voo::ViewElement, JsValue> {
    let label = format!("Hello, {}.", props.name);
    Ok(voo::rsx!(view, <p class="greeting">{label}</p>)?)
}
```

Create the adjacent `src/Greeting.css`:

```css
.greeting {
  font-weight: 600;
}
```

The `#[voo::props]` and `#[voo::component]` attributes emit the public schema;
the Vite plugin generates the host adapter and declaration from that schema.
The CSS file remains a normal bundler-owned asset.

Import it like a framework component.

Vue:

```vue
<script setup lang="ts">
import Greeting from "./Greeting.rs";
</script>

<template>
  <Greeting name="world" />
</template>
```

React:

```tsx
import Greeting from "./Greeting.rs";

export function App() {
  return <Greeting name="Rust" />;
}
```

Starting the Vite development server or running a production build generates
the application-local Rust crate, WASM module, framework adapter, and mirrored
TypeScript declaration under `.vooya/types`.

All generated application state is disposable:

```sh
npm exec -- vooya clean
```

See the working [Vue counter](https://github.com/vooyajs/vooya/tree/main/examples/vue-counter) and
[React counter](https://github.com/vooyajs/vooya/tree/main/examples/react-counter) for complete applications. For a
larger Rust-owned rendering surface, run the
[150,000 point Vue scatter plot](https://github.com/vooyajs/vooya/tree/main/examples/scatter-plot) with
`npm run dev:scatter`.

## Vite+

Vite+ is a unified CLI and toolchain around Vite, not a separate Vooya adapter.
The tested Vite+ path uses Vite+ 0.2.9's Vite core alias and the same
`vooya()` plugin configuration:

```sh
npm install --save-dev vite-plus@0.2.9
npx vp build
```

For a project managed by Vite+, follow its installation and migration guide,
including the documented `vite` alias to
`@voidzero-dev/vite-plus-core`. Keep `vooya()` in the normal Vite plugin list;
the current fixture needs npm's legacy peer resolver because the aliased core
uses Vite+'s `0.x` version instead of Vite's peer version. This is a recorded
Vite+ integration cost, not a requirement of the normal Vite path. The
Vooya compatibility check is:

```sh
npm run test:vite-plus
```

This is a compatibility smoke path, not a claim that Vooya owns Vite+'s
runtime, package manager, task runner, or every bundled tool.

## Experimental Rspack path

For an existing Rsbuild Vue application, install the Vue adapter and Rspack
integration from the same alpha channel:

```sh
npm install @vooya/vue@alpha
npm install --save-dev @vooya/rspack@alpha
```

Add the integration beside the normal Vue plugin:

```ts
import { defineConfig } from "@rsbuild/core";
import { pluginVue } from "@rsbuild/plugin-vue";
import { vooyaRsbuild } from "@vooya/rspack";

export default defineConfig({
  plugins: [pluginVue(), vooyaRsbuild()],
});
```

React projects use `vooyaRsbuild({ framework: "react" })` with their normal
Rsbuild React plugin. Direct Rspack configuration is documented in the
[`@vooya/rspack` package README](https://github.com/vooyajs/vooya/blob/main/packages/rspack/README.md).

This path currently requires Rspack `>=2.1.10` and the same local Rust/WASM
tools as Vite. It is experimental; SSR, Module Federation, and earlier Rspack
versions are not support claims. Exact fixture evidence currently uses 2.1.10.

## Experimental Webpack 5 path

Install the framework adapter and Webpack integration at the same exact Vooya
version. The current experimental range is Webpack `>=5`.

```sh
npm install @vooya/vue@alpha
npm install --save-dev @vooya/webpack@alpha
```

Add the plugin's loader rule alongside the application's normal framework and
CSS rules:

```js
import { vooyaWebpack } from "@vooya/webpack";

const vooya = vooyaWebpack({ framework: "vue" });

export default {
  experiments: { asyncWebAssembly: true },
  module: {
    rules: [
      vooya.rule(),
      { test: /\.css$/, use: ["style-loader", "css-loader"] },
    ],
  },
  plugins: [vooya],
};
```

React projects select `framework: "react"`. Webpack Dev Server uses full-page
live reload after successful Rust rebuilds; component state is not preserved.
Webpack 4, Module Federation, SSR, and hydration are outside the current claim.
