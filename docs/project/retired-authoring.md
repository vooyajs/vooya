# Retired source format

The current development line accepts ordinary Rust `.rs` Components and Stores.
It removes the `.voo` parser, formatter, compiler branch, bundler loaders, and
mirrored declarations. Examples and acceptance fixtures use Rust sources.
Historical releases and changelogs
retain their original behavior. This retirement is included in the
[alpha refresh](../maintainers/releases/0.2-alpha-refresh.md), including
`@vooya/vite@0.2.0-alpha.1`; follow the exact package graph in that record.

## Migrate an application

1. Define props with `#[vooya::props]` and `#[derive(vooya::FromJs)]`, events
   with `#[vooya::events]`, and the root function with `#[vooya::component]`.
   Stores use `#[vooya::store]`. Renaming an old file does not convert its syntax.
2. Move styles to an ordinary CSS file and reference it with
   `#[vooya::style("./Counter.css", scoped)]`.
3. Change host imports to `./Counter.rs`. Keep generated declarations in
   `.vooya/types`; configure `allowArbitraryExtensions` and `rootDirs` as in
   [Getting started](../guide/getting-started.md).
4. Use `Option<T>` for optional props and apply defaults explicitly in Rust.
   Use the existing in-place component update hook when instance state must
   survive prop updates. Owned resources belong to the returned root's cleanup
   scope; see the converted Counter and rendering examples.
5. Remove old custom source files and generated declarations, then run
   `vooya clean` before rebuilding. Format Rust with `rustfmt`.

See [Rust-file authoring](../guide/rust-file-authoring.md) for the supported role
contracts. Webpack/Rspack Rust integration requires the documented opt-in
0.2 alpha package graph; the old beta integrations cannot consume it.

## Removed APIs

- `voo-format`, `@vooya/vite/format`, and the repository format commands.
- Custom-format parser, formatter, Rust binding generator, and declaration
  exports from `@vooya/compiler`.
- `buildApplication({ components })` and `writeVooDeclarations` from the Rust
  provider and build-core facade. Compile authored Rust and use
  `writeRustSchemaDeclarations` for schema-driven declarations instead.
- Custom-format handling in Vite, Webpack, and Rspack. Loader rules match `.rs`.

`@vooya/compiler` retains shared ABI and scoped-style helpers. Internal ABI
symbols such as `voo_abi_version`, the schema section `__voo_schema`, and the
Rust shorthand `use vooya as voo` remain valid; they are not a source format.

The dedicated precompiled Vue package builder has also been retired from the
current development line. Existing source-authoring applications keep using
ordinary Rust imports. Component authors manage their own JS/WASM wrappers and
npm package metadata; see the [packaging retirement record](../rfcs/0006-precompiled-vue-artifacts.md).
