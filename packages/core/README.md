# `@vooya/core`

Rust and browser runtime used by the Vooya component compiler.

The package contains the Rust runtime source and the public `vooya` authoring
crate consumed by `@vooya/vite`, plus baseline wasm-bindgen output. Application
code normally imports generated `.rs` components/stores instead of importing
this package directly. Legacy
`.voo` components remain available only for existing projects and experimental
fixtures.

This package is an alpha. Rust-file source compilation requires Cargo, the
`wasm32-unknown-unknown` target, and the matching `wasm-bindgen` CLI.

The Rust runtime exposes owned DOM views, signals, an opt-in `tracked_effect`
dependency collector, keyed child reconciliation, and an explicit `batch`
boundary for coalescing synchronous signal notifications. The public `rsx!`
forms support keyed `for` items and conditional `if`/`else` branches.
