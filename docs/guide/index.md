# Guides

These guides take you from a clean Web application to a small Rust/WASM island.
They assume that Vue or React remains the host application and that Vooya owns
only the bounded capability you explicitly mount.

## Choose a path

| Goal | Start here |
| --- | --- |
| Run a first component | [Getting started](./getting-started) |
| Understand the Rust source contract | [Rust-file authoring](./rust-file-authoring) |
| Choose a bundler | [Bundler guide](./bundlers) |
| Add a canvas-heavy example | [Scatter plot](./scatter-plot) |
| Use another bundler | [Tooling reference](../reference/tooling) and the [compatibility matrix](../project/compatibility) |
| Diagnose a failed local build | [Troubleshooting](./troubleshooting) and the [FAQ](../faq) |

## The short version

1. Install the host framework adapter and the bundler integration.
2. Install Rust, the `wasm32-unknown-unknown` target, and the pinned
   `wasm-bindgen-cli`.
3. Add `vooya()` (or the matching experimental bundler adapter) to the host
   build.
4. Author an ordinary `.rs` component or store.
5. Run `vooya doctor` before the first development build.

Vooya is currently an alpha source-authoring toolchain. A clean consumer still
needs the Rust toolchain; a supported precompiled component distribution is a
future product, not an implicit feature of this package set.
