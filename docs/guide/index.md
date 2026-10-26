# Guides

These guides take you from the integration-layer mental model to a clean Web
application with a small Rust/WASM island.
They assume that the existing Web renderer remains the host application and
that Vooya owns only the bounded capability you explicitly mount. Vue and React
are the current supported first-party paths. Solid and Svelte are experimental and
currently covered on the Vite 7 Rust-file path; the layer can support other hosts only
through explicit adapters and independent evidence.

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
| Install the opt-in alpha | [Next release](../project/next-release.md) |
| Choose a bundler | [Bundler guide](./bundlers.md) |
| Add a canvas-heavy example | [Scatter plot](./scatter-plot.md) |
| Use another bundler | [Tooling reference](../reference/tooling.md) and the [compatibility matrix](../project/compatibility.md) |
| Diagnose a failed local build | [Troubleshooting](./troubleshooting.md) and the [FAQ](../faq.md) |

## The short version

1. Install the host framework adapter and the bundler integration.
2. Install Rust, the `wasm32-unknown-unknown` target, and the pinned
   `wasm-bindgen-cli`.
3. Add `vooya()` to the Vite host
   build.
4. Author an ordinary `.rs` component or store.
5. Run `vooya doctor` before the first development build.

Vooya is currently a beta source-authoring toolchain. A clean source consumer
needs the Rust toolchain, selected from system tools or the opt-in alpha preset.
Component packaging and npm publication belong to the component author. The current
supported first-party framework adapters are Vue and React. Solid and Svelte
are experimental first-party adapters; other host renderers remain an adapter
and evidence task.
