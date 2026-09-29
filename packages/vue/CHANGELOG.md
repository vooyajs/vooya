# Changelog

Historical entries were reconstructed from published package metadata and release
snapshots; see [release history evidence](../../docs/maintainers/release-history.md).

## 0.1.0-alpha.12

- Accept the shared `{ contract, loadBindings }` component bridge while retaining the previous two-argument call.
- Add `defineVooyaStore` to wrap generated store bridges in Vue composables with `state` and actions.
- Allow Vue versions `>=3.5.2` in peer dependencies.

## 0.1.0-alpha.11

- Keep late store lifecycle callbacks safe after component disposal and align generated store composables with the shared `state`-plus-actions shape.

## 0.1.0-alpha.10

- Add Rust-file components and lifecycle-safe instance-scoped store consumption.
- Surface component update and disposal failures through the adapter error event.

## 0.1.0-alpha.9

- Coordinated alpha release; Vue adapter implementation is unchanged from alpha.8.

## 0.1.0-alpha.8

- Coordinated alpha release; Vue adapter implementation is unchanged from alpha.7.

## 0.1.0-alpha.7

- Adopt Semifold for coordinated alpha releases; Vue adapter implementation is unchanged from alpha.6.

## 0.1.0-alpha.6

- Coordinated alpha release; Vue adapter implementation is unchanged from alpha.5.

## 0.1.0-alpha.5

- Ship MIT and Apache-2.0 license texts in the package.

## 0.1.0-alpha.4

- Emit development lifecycle diagnostics for load, mount, update, and disposal; clean up event listeners after mount failures.

## 0.1.0-alpha.3

- Stabilize component-handle teardown during framework unmount.

## 0.1.0-alpha.2

- Unify public adapter API and type names under Vooya.

## 0.1.0-alpha.1

- Ship generated `.voo` component integration with reactive prop updates, emitted events, async bindings, disposal, and load/mount error events.

## 0.1.0-alpha.0

- Initial npm publication of the Vue 3 host adapter with JavaScript and TypeScript declarations.
