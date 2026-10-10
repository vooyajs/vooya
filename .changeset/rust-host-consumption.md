---
"@vooya/vite": patch
"@vooya/core": patch
---

Resolve Rust imports through Vite so project-root paths and aliases work. Update
Rust component styles during development and allow failed WASM loads to retry
when components are mounted again.

Propagate Store action errors when the Rust return type uses `std::result::Result`
or `core::result::Result`, just as for the short `Result` spelling.
