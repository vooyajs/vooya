# @vooya/react

Historical entries were reconstructed from published package metadata and release
snapshots; see [release history evidence](../../docs/maintainers/release-history.md).

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
