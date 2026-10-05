# Changelog

Historical entries were reconstructed from published package metadata and release
snapshots; see [release history evidence](../../docs/maintainers/release-history.md).

## 0.2.0-alpha.0

### Minor Changes

- 4230642: Move Rust compilation, schema handling, workspace management, and toolchain
  selection into `@vooya/provider-rust`. Keep `@vooya/build-core` as a compatible
  entry point sharing the same functions, error classes, and cache. Existing
  Rust projects need no configuration changes. This extraction does not add a
  public provider registry or support for another source language.
- 0c50316: Add an optional managed Rust/WASM toolchain with pinned downloads, an isolated cache, and shared automatic selection for builds and doctor. Projects may explicitly select their system toolchain. Host linker/SDK prerequisites still apply.
- e17b0cc: Add experimental native Octane 0.9 support for Rust-file components and stores through Vite 8, including generated TypeScript declarations. The private experimental adapter remains available only to source/tarball fixtures and is excluded from this npm release. Legacy .voo inputs, SSR and older Octane versions are outside this initial scope.
- 9bb6287: Support Rust-file components and Stores in Webpack/Rspack with shared adapter module generation, scoped CSS and centralized declarations. Keep the legacy .voo path and verify Vue/React in clean packed production consumers.

  Normalize sourceRoot dot paths when selecting Rust modules and resolving schema imports, and exclude installed node_modules from Rust source discovery. Add clean packed Solid/Svelte browser and strict declaration acceptance on Vite 8.

  Keep Rust-file watch builds stable by preserving unchanged generated CSS and comparing only authored Rust/Cargo/style inputs. Verify Rust error recovery and new module detection without restarting the watcher.
- 6859de4: Start the 0.2 SSR integration foundation. Vue generated Store factories now load
  only after client mount, and the advanced Store composable accepts a lazy factory.
  React's package entry preserves its client-module directive. Server rendering
  and host hydration have adapter-level regression coverage. The named Nuxt 4.5.2
  fixture (Vite 8.3.1, Vue 3.5.43) also verifies production SSR hosts and
  browser-mounted WASM islands, including components, Stores and cleanup.
  Next.js, Edge runtimes and server rendering of Rust DOM content remain outside
  this release's verified scope.

  Extract Rust build mechanics behind the existing buildApplication facade and an
  internal provider interface, preserving the public build result, locking, staged
  artifacts, diagnostics, and default Rust configuration. The initial interface
  still models Rust's single-WASM artifact; it is not a public multi-language API.

  Route synchronous React Store factory failures through onError, matching asynchronous initialization failures.

### Patch Changes

- Updated dependencies [4230642]
- Updated dependencies [d2f41cf]
  - @vooya/provider-rust@0.2.0-alpha.0

## 0.1.0-beta.0

### Patch Changes

- cca8100: Prepare the first 0.1 beta package set for Rust-file authoring. Keep internal
  dependencies aligned with the reviewed beta versions. Vue and React with Vite
  remain the supported path; experimental adapters retain their documented limits.
  Authors still provide a Rust/WASM toolchain; managed preset installation is
  planned separately for 0.2.
- c4a2698: Generate concrete TypeScript interfaces for derived Rust structs and unit enums
  used in component props, events, and Store snapshots. Preserve each framework's
  native Store state container. Missing schemas remain `unknown`; a known struct
  with unrepresentable fields falls back to `Record<string, unknown>` rather than
  promising an unverified shape. Includes the implementation merged in PR #122.
- c4a2698: Resolve named schemas within their source group and conventional Rust module
  paths. Distinct reachable types sharing a short name receive deterministic
  aliases, including in nested fields and Store signatures. Ambiguous matches
  report their candidates instead of selecting an arbitrary shape. `use` aliases,
  inline modules, and `#[path]` overrides still require richer metadata. Includes
  PR #125; this does not claim completion of full Rust name resolution.
- 1e3e000: Serialize builds sharing one generated workspace without letting stale-lock
  recovery remove a new owner's lock. Keep the previous JavaScript, WASM, and
  workspace metadata intact when binding generation, schema validation, CSS or
  TypeScript generation, artifact reads, or final installation fails.
- Updated dependencies [cca8100]
- Updated dependencies [c4a2698]
  - @vooya/compiler@0.1.0-beta.0
  - @vooya/core@0.1.0-beta.0

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
