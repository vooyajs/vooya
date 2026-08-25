# `@vooya/rspack`

Experimental Rspack `>=2.1.10` integration for the legacy Vooya `.voo` source
component path. The current `.rs` authoring integration is Vite-only; this
package does not claim `.rs` discovery yet.

The package supports Vue and React applications through Rsbuild, and exposes a
lower-level Rspack plugin and loader rule for applications that configure
Rspack directly. Source consumers still need Cargo, the
`wasm32-unknown-unknown` target, and `wasm-bindgen-cli` `0.2.115`.

Keep every `@vooya/*` package on the same exact alpha version.

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

Configured Rust path dependencies participate in builds, but editing one while
the Rspack development server is running currently requires restarting that
server. Dependency-triggered live rebuilds remain a future compatibility goal.
