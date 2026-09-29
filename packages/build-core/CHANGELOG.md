# Changelog

Historical entries were reconstructed from published package metadata and release
snapshots; see [release history evidence](../../docs/maintainers/release-history.md).

## 0.1.0-alpha.13

- Preserve conventional Rust module lookup for multi-file `.rs` components and stores, including nested `mod` trees.
- Map Cargo diagnostics from copied helper modules back to authored source paths.
- Published internal dependencies: `@vooya/compiler@0.1.0-alpha.12`, `@vooya/core@0.1.0-alpha.12`.

## 0.1.0-alpha.12

- Inherit Rust dependency defaults from the nearest Cargo manifest, including workspace dependencies; explicit plugin options take precedence.
- Generate Solid and Svelte component/store declarations and include all four lifecycle error stages in Vue/React declarations.
- Use a size-oriented generated Cargo release profile (`opt-level = "s"`, LTO, one codegen unit, and aborting panics).
- Published internal dependencies: `@vooya/compiler@0.1.0-alpha.12`, `@vooya/core@0.1.0-alpha.12`.

## 0.1.0-alpha.11

- Align generated Vue and React store declarations with the shared hook shape: `state` plus actions.
- Published internal dependencies: `@vooya/compiler@0.1.0-alpha.11`, `@vooya/core@0.1.0-alpha.11`.

## 0.1.0-alpha.10

- Build ordinary Rust-file components and instance-scoped stores from generated or explicitly configured crate roots; read their schema and generate host declarations.
- Package the Rust authoring and macro crates with `@vooya/core` so installed consumers can build without a repository checkout.
- Reconcile copied Rust source topology and watch Rust-file stylesheet dependencies.
- Published internal dependencies: `@vooya/compiler@0.1.0-alpha.10`, `@vooya/core@0.1.0-alpha.10`.

## 0.1.0-alpha.9

- Move generated state into the disposable `.vooya/` workspace and mirror declarations under `.vooya/types`.
- Resolve a coherent Cargo/rustc/target/wasm-bindgen toolchain, including explicit Cargo paths.
- Published internal dependencies: `@vooya/compiler@0.1.0-alpha.9`, `@vooya/core@0.1.0-alpha.9`.

## 0.1.0-alpha.8

- First publication of the bundler-neutral Rust/WASM build core, extracted from the Vite plugin for reuse by Vite and experimental Rspack integration.
- Expose typed build results, mapped diagnostics, and configured Rust dependency watch roots.
- Published internal dependencies: `@vooya/compiler@0.1.0-alpha.8`, `@vooya/core@0.1.0-alpha.8`.
