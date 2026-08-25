# `@vooya/webpack`

Experimental Webpack 5 integration for the legacy Vooya `.voo` source component
path in Vue 3 and React 19 applications. The current `.rs` authoring
integration is Vite-only; this package does not claim `.rs` discovery yet. Source consumers still need Cargo, the
`wasm32-unknown-unknown` target, and `wasm-bindgen-cli` `0.2.115`.

Install every `@vooya/*` package at the same exact version.

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

React projects use `vooyaWebpack({ framework: "react" })`. The application
remains responsible for its normal Vue or React loader, HTML, JavaScript, and
CSS configuration.

Rust dependencies use the shared build-core contract:

The nearest `Cargo.toml` supplies defaults, and explicit `rust` options below
override same-named manifest dependencies. Regular packages and workspace
dependencies use the same shared build-core resolution rules.

```js
vooyaWebpack({
  rust: {
    dependencies: {
      serde: { version: "1", features: ["derive"] },
      "shared-engine": { path: "rust/shared-engine" },
    },
    webSysFeatures: ["HtmlCanvasElement"],
  },
});
```

The experimental range is Webpack `>=5`, with exact fixtures at 5.101.0 and
5.109.2. Webpack 4, SSR, hydration, Module Federation, and
state-preserving HMR are not supported claims. Webpack Dev Server uses its
normal live reload behavior after successful Rust rebuilds.
