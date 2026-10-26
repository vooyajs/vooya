<h1 align="center">Vooya</h1>

<p align="center">
  <strong>Bring Rust and WebAssembly into the web app you already have.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@vooya/vite"><img src="https://img.shields.io/npm/v/@vooya/vite/beta?label=beta" alt="npm beta version"></a>
  <a href="https://github.com/vooyajs/vooya/actions/workflows/verify.yml"><img src="https://github.com/vooyajs/vooya/actions/workflows/verify.yml/badge.svg?branch=main" alt="build status"></a>
  <a href="LICENSE-MIT"><img src="https://img.shields.io/github/license/vooyajs/vooya" alt="license"></a>
</p>

<p align="center">
  <a href="https://vooyajs.com/">Documentation</a> ·
  <a href="https://vooyajs.com/guide/getting-started">Getting started</a> ·
  <a href="https://vooyajs.com/zh-CN/guide/getting-started">中文指南</a> ·
  <a href="https://vooyajs.github.io/vooya-lab/">Examples &amp; experiments</a>
</p>

Vooya connects Rust components and stores to existing web applications. Write
ordinary `.rs` files, reuse browser-compatible crates, and import the result
through a framework adapter. Your application keeps its router, page tree,
and surrounding UI. Rust owns a focused component or stateful capability.

Vooya handles the work between them: compilation, WASM loading, typed bindings,
props and events, reactive snapshots, lifecycle, and cleanup. Use it for a
parser, visualization, simulation, editor surface, or another bounded workload.

## How it fits together

[![Vooya ecosystem: bundlers connect to the Rust provider and native toolchain at build time; framework adapters connect the web app to generated WASM and JavaScript at runtime. Dashed language providers and ellipses indicate future extensions; asterisks mark experimental integrations.](docs/public/architecture.svg)](docs/public/architecture.svg)

- **Your framework owns the application.** Vooya's adapters follow its lifecycle
  and reactive model; a Component owns its mounted subtree, while a Store exposes
  snapshots, actions, and subscriptions.
- **Your bundler owns the build integration.** Vooya plugins connect source
  imports, generated modules, assets, rebuilds, and diagnostics to Vite,
  Rspack, or Webpack.
- **The language provider owns compilation.** Rust is implemented today.
  `@vooya/build-core` currently forwards to `@vooya/provider-rust`; a public
  multi-language provider protocol is still being designed.
- **Toolchains run at build time.** Use system Rust tools or the optional alpha
  `@vooya/preset`, which prepares pinned native tools. The browser runs the
  generated JS and WASM; the preset is not a browser-hosted compiler.

The diagram shows the current Rust path and future extension points. Asterisks
mark experimental integrations; dashed outlines and ellipses indicate planned
or additional integrations. See the compatibility matrix below for supported
combinations. Read the
[architecture rationale](https://vooyajs.com/rfcs/0008-layer-boundary-and-roadmap)
and [provider research](https://vooyajs.com/project/language-provider-research)
for the design and its open questions.

## A Rust component, used from Vue

```rust
// Greeting.rs
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
    voo::rsx!(view, <p>{label}</p>)
}
```

```vue
<script setup lang="ts">
import Greeting from "./Greeting.rs";
</script>

<template>
  <Greeting name="Vooya" />
</template>
```

Vooya generates the wrapper and TypeScript declarations. Rust Stores use the
same authoring model and expose framework-native state through generated hooks.
Follow the [Vue](https://vooyajs.com/guide/getting-started#vue) or
[React](https://vooyajs.com/guide/getting-started#react) quickstart for installation,
toolchain prerequisites, and project configuration.

## Current scope

Vooya is a prerelease project. The default quickstart uses the **beta** channel;
the **0.2 alpha** is an explicit opt-in. Package versions differ: use the
documented installation path rather than assigning one version to every package.

| Area | Current boundary |
| --- | --- |
| Authoring | Rust `.rs` Components and Stores; other language providers are research |
| Frameworks | Vue and React supported; Solid and Svelte experimental |
| Bundlers | Vite 7/8 is the primary path; Rspack and Webpack support Rust `.rs` Components and Stores in the [0.2 alpha graph](docs/project/next-release.md), with Vue/React coverage |
| Toolchains | System Rust tools; optional managed `@vooya/preset` in alpha, with native SDK/linker prerequisites |
| Development | Rust rebuilds reload the page; Rust state is not preserved |
| Distribution | Authors organize and publish ordinary JS/WASM packages; Vooya has no dedicated component-package format |

Rspack and Webpack integrations remain experimental: they have working
implementations with a limited acceptance matrix. Rust `.rs` authoring requires
the **0.2 alpha** package set; the older non-Vite beta packages do not implement
that path. Production browser tests cover Vue and React; Rust watch recovery
is verified for Vue. Other framework/watch combinations are not yet verified.

See the [compatibility matrix](https://vooyajs.com/project/compatibility),
[project status](https://vooyajs.com/project/status), and
[alpha installation guide](https://vooyajs.com/project/next-release) for exact
versions and verified combinations. The current development line has removed
the custom source format and its tooling; see the [migration guide](docs/project/retired-authoring.md).

## Learn more

- [Rust authoring](https://vooyajs.com/guide/rust-file-authoring) — Components, Stores, props, events, and styles.
- [Component ownership](https://vooyajs.com/concepts/component-boundary) — what the host and Rust each own.
- [Tooling and dependencies](https://vooyajs.com/reference/tooling) — Cargo dependencies, preset, and diagnostics.
- [Examples](https://vooyajs.com/examples/) — explore real workloads and local demos.
- [Design records](docs/README.md#design-records) — architecture proposals and decisions.

## Community

Questions, focused bug reports, and contributions are welcome. Start with
[Contributing](CONTRIBUTING.md), browse the
[good first issues](https://github.com/vooyajs/vooya/issues?q=is%3Aissue%20is%3Aopen%20label%3A%22good%20first%20issue%22),
or discuss a proposal in [Issues](https://github.com/vooyajs/vooya/issues).

[Vooya Lab](https://vooyajs.github.io/vooya-lab/) exercises browser and integration
boundaries. [Vooya FS](https://github.com/vooyajs/fs) is a separate native Node.js
batch-filesystem project; it uses Node-API, with its own runtime and support scope.

## License

Dual-licensed under [MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE).
