---
"@vooya/vite": patch
---

Preserve Vite's explicit `?raw` imports of Rust and Voo files as source strings, including eager source-preview globs, instead of compiling them into component or Store modules. Normal component and Store imports continue to compile.
