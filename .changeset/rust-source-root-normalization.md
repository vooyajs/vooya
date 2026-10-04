---
"@vooya/build-core": patch
---

Normalize dot segments in Rust source-root module selection and schema declaration paths, including public root modules. Exclude `node_modules` and `.git` from authored Rust discovery when the application root is selected.
