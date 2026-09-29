---
"@vooya/build-core": patch
---

Resolve named schemas within their source group and conventional Rust module
paths. Distinct reachable types sharing a short name receive deterministic
aliases, including in nested fields and Store signatures. Ambiguous matches
report their candidates instead of selecting an arbitrary shape. `use` aliases,
inline modules, and `#[path]` overrides still require richer metadata. Includes
PR #125; this does not claim completion of full Rust name resolution.
