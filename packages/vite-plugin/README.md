# `@vooya/vite-plugin`

Compile Rust implementations from `.voo` files and import them as Vue or React
components.

```sh
npm install --save-dev @vooya/vite-plugin@alpha
npm install @vooya/vue@alpha
```

```js
import vue from "@vitejs/plugin-vue";
import { vooya } from "@vooya/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue(), vooya()],
});
```

The plugin builds one application-local WASM module under `.voo-cache`. Source
compilation currently requires Cargo, the `wasm32-unknown-unknown` target, and
the matching `wasm-bindgen` CLI.

Format components with `npx voo-format src` or check them with
`npx voo-format --check src`.

## Precompiled component artifacts

Component authors can compile one source `.voo` file into a normal npm package
with Vue and React entry points:

```js
import { buildPrecompiledArtifact } from "@vooya/vite-plugin/artifact";

buildPrecompiledArtifact({
  source: "src/Counter.voo",
  packageName: "@example/counter",
  version: "0.1.0",
  outputDir: "dist/package",
});
```

The authoring build still requires Rust and `wasm-bindgen`. The generated
package contains compiled WASM, declarations, styles, a versioned manifest, and
`./vue` plus `./react` exports. Consumers install the generated package and the
matching `@vooya/vue` or `@vooya/react` adapter; they do not need a Rust
toolchain.

The artifact API and manifest are alpha contracts. See
[RFC 0004](../../docs/rfcs/0004-precompiled-component-artifact.md) for the V1
layout, verification requirements, and deferred decisions.
