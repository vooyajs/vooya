# `@vooya/rspack`

Experimental Rspack `>=2.1.10` integration for Rust-file components and Stores.
Import `.rs` files directly; the plugin builds WASM, generates the framework
bridge, and writes declarations under `.vooya/types`. The legacy `.voo` loader
remains available for existing projects.

The package supports Vue and React applications through Rsbuild, and exposes a
lower-level Rspack plugin and loader rule for applications that configure
Rspack directly. Source consumers still need Cargo, the
`wasm32-unknown-unknown` target, and `wasm-bindgen-cli` `0.2.115`.

Install Vooya packages from the same `beta` channel and retain the lockfile;
package versions are independent with exact internal dependencies.

## Rsbuild

```ts
import { defineConfig } from "@rsbuild/core";
import { pluginVue } from "@rsbuild/plugin-vue";
import { vooyaRsbuild } from "@vooya/rspack";

export default defineConfig({
  plugins: [pluginVue(), vooyaRsbuild()],
});
```

Select the React adapter explicitly:

```ts
vooyaRsbuild({ framework: "react" });
```

Rust dependencies and `web-sys` features use the same build-core contract as
the Vite integration:

The nearest `Cargo.toml` supplies defaults, and explicit `rust` options below
override same-named manifest dependencies. Regular packages and workspace
dependencies use the same shared build-core resolution rules.

```ts
vooyaRsbuild({
  rust: {
    dependencies: {
      serde: { version: "1", features: ["derive"] },
      "shared-engine": { path: "rust/shared-engine" },
    },
    webSysFeatures: ["HtmlCanvasElement"],
  },
});
```

## Direct Rspack

```js
import { vooyaRspack } from "@vooya/rspack";

const vooya = vooyaRspack({ framework: "vue" });

export default {
  experiments: { css: true },
  module: {
    rules: [vooya.rule(), { test: /\.css$/, type: "css" }],
  },
  plugins: [vooya],
};
```

The host application remains responsible for its normal Vue or React loader,
entry, HTML, and CSS configuration.

## Verified boundary

- `@rspack/core` and `@rspack/cli` 2.1.10;
- Rsbuild 2.1.13 with Vue and React browser lifecycle checks;
- Rslib 0.23.2 production library output;
- production WASM/CSS emission;
- source `.voo` rebuild, mapped Rust diagnostics, and failed-build recovery.

SSR, hydration, Module Federation, state-preserving HMR, and Rspack versions
below 2.1.10 are not compatibility claims. Exact fixture evidence currently
uses Rspack 2.1.10.

Rust source roots, manifests, path dependencies, and referenced styles are
registered with Rspack's watcher. Rust-file production acceptance runs with
`npm run test:rust-bundlers` against packed packages and Rspack 2.1.10: Vue/React,
scoped CSS, Store actions, props/events, and unmount/remount. The Vue Rust-file
fixture also checks watch error recovery, stylesheet updates, newly added Rust
modules, and that generated assets do not cause a rebuild loop. Rust-file
Rsbuild/Rslib parity and Solid/Svelte browser acceptance are not yet verified;
the older `.voo` fixtures retain their separate evidence.
