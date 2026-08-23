# Guides

These guides take you from the integration-layer mental model to a clean Web
application with a small Rust/WASM island.
They assume that Vue or React remains the host application and that Vooya owns
only the bounded capability you explicitly mount.

## Mental model first

The host framework owns the page tree, router, business state, and the host
element. Vooya mounts one Rust-owned island below that element and keeps the
boundary explicit through props, events, lifecycle, and disposal. Start with
the [component boundary](../concepts/component-boundary.md) if you are unsure
whether a feature belongs in Rust, or read [why Vooya](../why-vooya.md) for the
problem this layer is intended to solve.

## Choose a path

| Goal | Start here |
| --- | --- |
| Run a first component | [Getting started](./getting-started.md) |
| Understand the Rust source contract | [Rust-file authoring](./rust-file-authoring.md) |
| Choose a bundler | [Bundler guide](./bundlers.md) |
| Add a canvas-heavy example | [Scatter plot](./scatter-plot.md) |
| Use another bundler | [Tooling reference](../reference/tooling.md) and the [compatibility matrix](../project/compatibility.md) |
| Diagnose a failed local build | [Troubleshooting](./troubleshooting.md) and the [FAQ](../faq.md) |

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
