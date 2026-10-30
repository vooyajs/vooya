---
"@vooya/provider-rust": minor
"@vooya/vite": minor
---

Add opt-in Rust artifact groups with independent Cargo builds, target caches, WASM bindings and conversion type graphs. Vite maps each Rust import to its owning artifact, supports host dynamic imports without loading unrelated WASM, rebuilds affected groups during development, and emits a production artifact/loading manifest.

Configure non-overlapping `rust.artifacts` source roots and keep heavy dependencies in their owning unit. The default remains one shared artifact. Other bundlers reject the new option until they integrate the multi-artifact builder. Store disposal releases instances while browser modules remain cached; full reload behavior is unchanged.
