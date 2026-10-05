---
"@vooya/provider-rust": minor
"@vooya/build-core": minor
---

Move Rust compilation, schema handling, workspace management, and toolchain
selection into `@vooya/provider-rust`. Keep `@vooya/build-core` as a compatible
entry point sharing the same functions, error classes, and cache. Existing
Rust projects need no configuration changes. This extraction does not add a
public provider registry or support for another source language.
