# Beta Boundary

Vooya's beta focuses on one practical path: ordinary Rust files compiled to
WASM and consumed by Vue or React through the first-party adapters.

## Authoring decision

The current authoring path is `.rs` with explicit component or store roles.
`rsx!` is available for DOM-owned Rust components; stores keep state and
actions in Rust while Vue or React keeps rendering.

The earlier `.voo` format combined a manifest, Rust, and CSS in one custom file.
It was useful for validating the first component-island idea, but it required a
parallel parser and formatter and hid Rust from normal rust-analyzer and Cargo
 tooling. It also created a second source of truth for the public contract. The
Rust-file path removes those costs. Any remaining `.voo` code is transitional
compatibility coverage, not the beta authoring recommendation.

## Beta product boundary

- Vue 3 and React 19 adapters for Rust-file components and instance-scoped stores.
- Vite 7 and Vite 8 source builds; Vite+ is a separate compatibility smoke path.
- Vue Vapor is experimental and depends on Vue's own Vapor interop setup.
- Webpack and Rspack are experimental integration paths.
- ABI v1 covers the documented primitive, bigint, nullable, tuple, vector, and
  string-key map cases.
- No global store, SSR, hydration, precompiled component product, or Turbopack
  support is promised by beta.

## Lifecycle contract still being frozen

The public lifecycle phases are `load`, `mount`, `update`, and `dispose`.
Vue and React should expose the same phase and error shape. Async initialization
must not mount after unmount, and disposal must release listeners and store
subscriptions deterministically. The exact ordering and error table remain the
last contract work before beta sign-off.

## Evidence

The support matrix in [compatibility.md](compatibility.md) is evidence for the
named commands and versions only. A passing fixture does not expand the public
support claim beyond its row.
