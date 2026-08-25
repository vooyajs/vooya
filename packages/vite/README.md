# `@vooya/vite`

Compile Rust components and stores from ordinary `.rs` files with Vite `>=7 <9`
and import them as Vue, React, Solid, or Svelte modules. The retired `.voo`
path remains in repository regression fixtures only and is not a supported
authoring format.

```sh
npm install --save-dev @vooya/vite@alpha
npm install @vooya/vue@alpha
```

```js
import vue from "@vitejs/plugin-vue";
import { vooya } from "@vooya/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue(), vooya()],
});
```

The plugin builds one application-local WASM module in the disposable
`.vooya/` workspace and mirrors declarations under `.vooya/types`. TypeScript
projects must configure `allowArbitraryExtensions: true` and
`rootDirs: [".", ".vooya/types"]`. Source compilation currently requires Cargo,
the `wasm32-unknown-unknown` target, and the matching `wasm-bindgen` CLI.

Rust dependency defaults are read from the nearest `Cargo.toml`. Values passed
to `vooya({ rust })` override same-named manifest dependencies; without either,
the generated crate uses Vooya's defaults. Manifest paths are relative to that
manifest, while explicit plugin paths are relative to the application root.
Regular packages and workspace dependencies are supported. Vooya still owns
the exact generated `vooya`/`vooya-core`, `wasm-bindgen`, `js-sys`, and
`web-sys` versions or sources; inherited `web-sys` features remain available.

Rust schema generation produces a framework-neutral Component/Store bridge.
The selected Vue, React, Solid, or Svelte adapter supplies native lifecycle and
reactivity semantics; the bridge is generated output, not a stable IR for
applications to author directly.

Use `npx vooya clean` to remove generated state.

Format components with `npx voo-format src` or check them with
`npx voo-format --check src`.
