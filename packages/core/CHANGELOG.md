# Changelog

Historical entries were reconstructed from published package metadata and release
snapshots; see [release history evidence](../../docs/maintainers/release-history.md).

## 0.1.0-alpha.12

- The packaged authoring macros support an opt-in in-place component update hook for Canvas and other stateful browser surfaces.

## 0.1.0-alpha.11

- Coordinated alpha release; Rust runtime implementation is unchanged from alpha.10.

## 0.1.0-alpha.10

- Ship Rust authoring and macro crates alongside the browser runtime for installed source consumers.
- Add disposable signal subscriptions, batched transactions, reentrancy protection, tracked reactive effects, and keyed child reconciliation.
- Add signal-backed text/attributes, owned event bindings, host event emission, conditionals, and keyed loops to Rust `rsx!` authoring.

## 0.1.0-alpha.9

- Coordinated alpha release; browser runtime implementation is unchanged from alpha.8.

## 0.1.0-alpha.8

- Ship complete package metadata for the shared build-core integration; browser runtime behavior is unchanged from alpha.7.

## 0.1.0-alpha.7

- Adopt Semifold for coordinated alpha releases; browser runtime behavior is unchanged from alpha.6.

## 0.1.0-alpha.6

- Coordinated alpha release; browser runtime implementation is unchanged from alpha.5.

## 0.1.0-alpha.5

- Ship MIT and Apache-2.0 license texts in the package.

## 0.1.0-alpha.4

- Add mount cleanup callbacks that execute once in reverse order, including cleanup after a failed mount.

## 0.1.0-alpha.3

- Coordinated alpha release alongside adapter teardown and Vite HMR fixes; runtime source is unchanged from alpha.2.

## 0.1.0-alpha.2

- Unify public runtime branding and Rust crate references under Vooya.

## 0.1.0-alpha.1

- Ship Rust runtime sources and the `./rust/Cargo.toml` export for application-specific `.voo` compilation, with the structured Rust view API.

## 0.1.0-alpha.0

- Initial npm publication of the browser WASM runtime and generated JavaScript entry.
