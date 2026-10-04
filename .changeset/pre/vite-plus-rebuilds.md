---
"@vooya/vite": patch
"@vooya/webpack": patch
"@vooya/rspack": patch
---

Resolve Rust file mappings only when a Rust module is imported, keeping legacy component builds independent of those mappings. Preserve Rust edits made during Webpack and Rspack builds so watch mode compiles the latest source.
