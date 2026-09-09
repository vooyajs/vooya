# Changelog

## v0.1.0-alpha.12

### Features

- Add Solid and Svelte adapters for Rust-file components and instance-scoped stores, and move generated framework integration behind a shared bridge definition that each host adapter wraps with its native reactive and lifecycle primitives. Rust dependency defaults now follow explicit plugin options, then the nearest Cargo manifest, then Vooya defaults. Routine CI no longer installs a browser or runs E2E matrices; those remain in the local release gate.

### Fixes

- Add an Astro 7.3 client-island release proof and a reusable ordinary-Rust Math Plot template. Prevent repeated Astro environment builds from racing generated WASM cleanup, ignore generated workspace changes in dev HMR, use selector-safe virtual CSS IDs, and normalize queried Rust module IDs. Add an opt-in in-place component update hook for Canvas and other stateful browser surfaces.
