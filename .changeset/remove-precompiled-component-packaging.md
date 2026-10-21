---
"@vooya/vite": minor
---

Remove the experimental `buildPrecompiledVueArtifact` and
`validatePrecompiledVueArtifactOutput` exports from `@vooya/vite/build`.
Component authors can organize their JavaScript/WASM entry points, assets,
declarations and npm metadata themselves without a Vooya-specific package format.
The general build exports, Rust source authoring, framework adapters and managed
toolchain preset remain available.
