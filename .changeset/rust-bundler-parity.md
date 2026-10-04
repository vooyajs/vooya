---
"@vooya/build-core": minor
"@vooya/vite": patch
"@vooya/webpack": minor
"@vooya/rspack": minor
---

Support Rust-file components and Stores in Webpack/Rspack with shared adapter module generation, scoped CSS and centralized declarations. Keep the legacy .voo path and verify Vue/React in clean packed production consumers.

Normalize sourceRoot dot paths when selecting Rust modules and resolving schema imports, and exclude installed node_modules from Rust source discovery. Add clean packed Solid/Svelte browser and strict declaration acceptance on Vite 8.

Keep Rust-file watch builds stable by preserving unchanged generated CSS and comparing only authored Rust/Cargo/style inputs. Verify Rust error recovery and new module detection without restarting the watcher.
