# Changelog

Historical entries were reconstructed from published package metadata and release
snapshots; see [release history evidence](../../docs/maintainers/release-history.md).

## 0.1.0-beta.2

### Patch Changes

- 27048de: Accept generated Rust Store interfaces in the public low-level store adapters without requiring arbitrary string keys. Preserve inferred snapshot types and declared action signatures, including Promise-returning factories; existing explicit generic calls remain supported.

## 0.1.0-beta.1

### Patch Changes

- 83c2127: Report synchronous component binding loader failures through the existing
  `onError` lifecycle callback in React, Solid, and Svelte, matching rejected
  loader promises. Report synchronous Solid and Svelte Store factory failures
  through their existing `onError` callback without losing owner context.

## 0.1.0-beta.0

### Patch Changes

- cca8100: Prepare the first 0.1 beta package set for Rust-file authoring. Keep internal
  dependencies aligned with the reviewed beta versions. Vue and React with Vite
  remain the supported path; experimental adapters retain their documented limits.
  Authors still provide a Rust/WASM toolchain; managed preset installation is
  planned separately for 0.2.

## 0.1.0-alpha.12

- First experimental Svelte 5 adapter for Rust-file components and instance-scoped stores, with a host component, callback events, native readable state, and disposal through the shared generated bridge contract.
- The source-authoring evidence path is Vite; this publication does not establish Rspack/Webpack support.
