# @vooya/provider-rust

The Rust build implementation for Vooya. It owns Rust source discovery, Cargo
manifests, toolchain selection, `wasm-bindgen`, schema extraction, generated
bindings and declarations, diagnostics, and the generated `.vooya` workspace.
It is independent of Vite, Rspack, and Webpack.

This package is available starting at `0.2.0-alpha.0`. It is intended for
build integrations; application authors should continue using `@vooya/vite`,
`@vooya/rspack`, or `@vooya/webpack` with their existing configuration.

```ts
import { buildApplication, resolveToolchain } from "@vooya/provider-rust";

const applicationRoot = process.cwd();
const toolchain = resolveToolchain({ cwd: applicationRoot });
const artifact = buildApplication({ applicationRoot, toolchain });
```

`@vooya/build-core` re-exports this API for compatibility. Both entry points use
the same error classes and toolchain cache. The synchronous `buildApplication`
API, Rust options, generated paths, and output shape are unchanged.

Each application build currently produces one aggregate Rust/WASM artifact for
its authored roots. Package extraction does not create lazy or independently
loadable WASM artifacts, and importing one lightweight root does not isolate
unrelated Rust dependencies. Per-root artifact grouping, loading, watching,
diagnostics, and disposal are tracked separately in
[Issue #106](https://github.com/vooyajs/vooya/issues/106).

The optional `@vooya/preset` prepares pinned Rust tools. This provider discovers
it from the consuming project, just as the previous build-core implementation
did. The provider does not install the preset or download tools on import.

The internal `BuildProvider` and `BuildArtifact` interfaces are not a public
multi-language extension API. Go and other languages need their own loader and
Vooya lifecycle bindings before they can be supported. See the
[provider research](../../docs/project/language-provider-research.md) for the
remaining architecture work.
