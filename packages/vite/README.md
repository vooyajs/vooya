# `@vooya/vite`

Compile Rust components and stores from ordinary `.rs` files with Vite `>=7 <9`
and import them as Vue or React modules. The older `.voo` component path remains
available for existing projects and legacy fixtures.

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

Use `npx vooya clean` to remove generated state.

Format components with `npx voo-format src` or check them with
`npx voo-format --check src`.
