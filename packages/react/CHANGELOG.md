# Changelog

Historical entries were reconstructed from published package metadata and release
snapshots; see [release history evidence](../../docs/maintainers/release-history.md).

## 0.2.0-alpha.0

### Minor Changes

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
- f6dc677: Preserve nullable values at the framework boundary. React now distinguishes a
  ready Store snapshot containing null from an unloaded Store. Vue preserves an
  omitted optional Boolean prop as undefined so Rust receives None rather than
  Some(false), while retaining explicit Boolean values and declared defaults.

## 0.1.0-alpha.12

- Accept the shared `{ contract, loadBindings }` component bridge while retaining the previous two-argument call.
- Add `defineVooyaStore` to wrap generated store bridges in React hooks with `state` and actions.

## 0.1.0-alpha.11

- Coordinated alpha release with the shared generated store-hook shape; React adapter implementation is unchanged from alpha.10.

## 0.1.0-alpha.10

- Add Rust-file component and instance-scoped store integration using React external-store subscriptions.
- Surface component update and disposal failures through the adapter error callback.

## 0.1.0-alpha.9

- Apply declared `.voo` prop defaults before mount, matching the Vue adapter.

## 0.1.0-alpha.8

- Coordinated alpha release; React adapter implementation is unchanged from alpha.7.

## 0.1.0-alpha.7

- Adopt Semifold for coordinated alpha releases; React adapter implementation is unchanged from alpha.6.

## 0.1.0-alpha.6

- Coordinated alpha release; React adapter implementation is unchanged from alpha.5.

## 0.1.0-alpha.5

- Ship MIT and Apache-2.0 license texts in the package.

## 0.1.0-alpha.4

- Emit development lifecycle diagnostics for load, mount, update, and disposal; clean up event listeners after mount failures.

## 0.1.0-alpha.3

- Coordinated alpha release alongside generated-handle teardown fixes in the Vite plugin; the React adapter runtime is unchanged from alpha.2.

## 0.1.0-alpha.2

- Unify public adapter API and type names under Vooya.

## 0.1.0-alpha.1

- Ship generated `.voo` component integration with prop updates, callback events, async bindings, disposal, and load/mount error callbacks.

## 0.1.0-alpha.0

- Initial npm publication of the React 19 host adapter with JavaScript and TypeScript declarations.
