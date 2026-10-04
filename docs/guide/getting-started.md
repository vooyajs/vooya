# Getting Started

Add one Rust component to an existing Vite application. Choose your framework:

- [Vue 3](#vue): install the adapter and configure the Vue plugin.
- [React 19](#react): install the adapter and configure the React plugin.

Both paths use the same [Greeting component](#first-component), then
[run and check the result](#verify-before-the-first-dev-run). This guide assumes
Vite 7 or 8, Vue `>=3.5.2 <4` or React `>=19`, and working application entry points
and `dev`/`build` scripts. If you do not have an application yet, [create a Vue or React Vite
project](https://vite.dev/guide/#scaffolding-your-first-vite-project) first.

[Solid, Svelte, Vite+, Rspack, and Webpack](./other-integrations.md) have separate
setup notes. Check their support boundaries before choosing them.

## Prerequisites

- A Node.js version supported by your Vite version (`^20.19.0` or `>=22.12.0`
  for Vite 8).
- A current stable Rust toolchain.
- The `wasm32-unknown-unknown` Rust target.
- `wasm-bindgen-cli` version `0.2.115` for the current beta runtime.

### Windows MSVC prerequisite

If Rust reports a host ending in `-pc-windows-msvc`, install Visual Studio Build
Tools before installing `wasm-bindgen-cli`. Select the **Desktop development with
C++** workload, including MSVC C++ build tools and a Windows SDK. Cargo needs the
MSVC linker, `link.exe`, to compile the CLI. Reopen the terminal after installation
so the linker is available on `PATH`.

### Install the WASM tools

On every platform, install the target and matching CLI:

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.115 --locked
wasm-bindgen --version
```

Install Vooya packages from `beta` and retain your lockfile. The first beta is
`0.1.0-beta.0`; later packages may have different versions, with exact internal
dependencies managed by the release workflow. Do not mix unreleased `main`
sources with published adapters. This path compiles Rust locally; Vooya does
not install Rust for you. See [compatibility](../project/compatibility.md) for
the supported framework and bundler versions.

## Vue

Install the Vue adapter and Vite plugin in an existing Vue application. The
application must already depend on `vue`, `vite`, and `@vitejs/plugin-vue`.

npm:

```sh
npm install @vooya/vue@beta
npm install --save-dev @vooya/vite@beta
```

pnpm (see [install-script help](#using-pnpm) if esbuild is blocked):

```sh
pnpm add @vooya/vue@beta
pnpm add --save-dev @vooya/vite@beta
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

Next, [create the Greeting component](#first-component).

## React

Install the adapter and plugin in an existing React application with `react`,
`react-dom`, `vite`, and `@vitejs/plugin-react` already installed.

npm:

```sh
npm install @vooya/react@beta
npm install --save-dev @vooya/vite@beta
```

pnpm (see [install-script help](#using-pnpm) if esbuild is blocked):

```sh
pnpm add @vooya/react@beta
pnpm add --save-dev @vooya/vite@beta
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

Next, [create the Greeting component](#first-component).

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

Vue: replace `src/App.vue` with:

```vue
<script setup lang="ts">
import Greeting from "./Greeting.rs";
</script>

<template>
  <Greeting name="world" />
</template>
```

React: replace `src/App.tsx` with:

```tsx
import Greeting from "./Greeting.rs";

export default function App() {
  return <Greeting name="Rust" />;
}
```

## Verify before the first dev run

For TypeScript, merge these options into the application's tsconfig (usually
`tsconfig.app.json`):

```json
{
  "compilerOptions": {
    "allowArbitraryExtensions": true,
    "rootDirs": [".", ".vooya/types"]
  }
}
```

Check the Rust tools before starting Vite:

```sh
npm exec -- vooya doctor
# pnpm: pnpm exec vooya doctor
```

Resolve any errors before continuing. See the [toolchain reference](../reference/tooling.md#doctor)
for Cargo selection and diagnostic details, or the [troubleshooting guide](./troubleshooting.md)
if setup fails.

Start the development server:

```sh
npm run dev
# pnpm: pnpm run dev
```

Open the local URL printed by Vite. The page should show **Hello, world.** in
Vue or **Hello, Rust.** in React, with bold text from `Greeting.css`. Change the
`name` prop to confirm that your host application supplies the Rust component's input.
The first run compiles Rust and may take longer than later runs.

Wait for the page to render, then stop the server and check the production build:

```sh
npm run build
# pnpm: pnpm run build
```

Run dev first: Vite templates may run `tsc` or `vue-tsc` before the build, and
they need the declarations generated during that first dev run.

Vite generates the Rust crate, WASM, adapters, and TypeScript declarations under
`.vooya/`. After generation, run your application's existing typecheck script if
it has one. To remove generated state and rebuild it later:

```sh
npm exec -- vooya clean
```

## Using pnpm

The commands above include pnpm alternatives.

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

## Next steps

See the working [Vue counter](https://github.com/vooyajs/vooya/tree/main/examples/vue-counter) and
[React counter](https://github.com/vooyajs/vooya/tree/main/examples/react-counter).
Use a [Store](../concepts/store.md) when Rust should own the logic while Vue or
React renders the interface. Continue with [Rust authoring](./rust-file-authoring.md)
for props, events, and styles.

## Solid

See [Solid setup](./other-integrations.md#solid), an experimental Vite 7 path.

## Svelte

See [Svelte setup](./other-integrations.md#svelte), an experimental Vite 7 path.

## Vite+

See [Vite+ setup](./other-integrations.md#vite).

## Experimental Rspack path

See [Rspack setup](./other-integrations.md#experimental-rspack-path).

## Experimental Webpack 5 path

See [Webpack setup](./other-integrations.md#experimental-webpack-5-path).
