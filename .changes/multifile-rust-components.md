---
vooya-build-core: "patch:fix"
vooya-vite: "patch:fix"
---

Preserve conventional Rust module lookup for multi-file `.rs` components and
stores. Thin component roots can now use ordinary nested `mod` trees, helper
edits participate in Vite HMR, and Cargo diagnostics from copied helper modules
map back to authored source paths. The clean Astro Math Plot consumer now
verifies dependency HMR and production output from a packed multi-file example.
