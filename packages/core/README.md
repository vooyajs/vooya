# `@vooya/core`

Rust and browser runtime used by the Vooya component compiler.

The package contains the Rust runtime source consumed by `@vooya/vite`
and baseline wasm-bindgen output. Application code normally imports generated
`.rs` components/stores instead of importing this package directly. Legacy
`.voo` components remain available during the alpha migration.

This package is an alpha. Rust-file source compilation requires Cargo, the
`wasm32-unknown-unknown` target, and the matching `wasm-bindgen` CLI.

The Rust runtime exposes owned DOM views, signals, an opt-in `tracked_effect`
dependency collector, keyed child reconciliation, and an explicit `batch`
boundary for coalescing synchronous signal notifications. The public `rsx!`
loop form supports keyed items; conditional branch syntax is not yet part of
the macro contract.
