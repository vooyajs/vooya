# Changelog

## v0.1.0-alpha.10

### Fixes

- Compile functional :host selectors in scoped styles and reject unsupported forms with a source-oriented error.

## v0.1.0-alpha.9

### Features

- Move generated application state into a disposable `.vooya/` workspace and mirror component declarations under `.vooya/types` instead of writing them beside source `.voo` files.
- Add the first experimental Webpack 5 source `.voo` integration for Vue and React, including production output, browser lifecycle coverage, Rust failure recovery, watched path dependencies, and documented compatibility bounds.

### Fixes

- Apply declared .voo prop defaults in the React adapter before mount, matching the Vue adapter.

### Maintenance

- Rename @vooya/vite-plugin to @vooya/vite.

## v0.1.0-alpha.8

### Features

- Add the first experimental Rspack 2.1 source `.voo` integration for Vue and React, backed by the shared Rust/WASM build core, strict packed fixtures, browser lifecycle checks, mapped diagnostics, and configured Rust path dependencies.

### Fixes

- Publish complete TypeScript declarations for the compiler and Vite plugin, remove duplicated generated JavaScript from source control, and add the first public contribution and issue-reporting workflow.
- Verify Vite 8 source authoring, keep the runtime ABI entry browser-light, and record the Vite+ compatibility smoke path without presenting it as a separate bundler adapter.

## v0.1.0-alpha.7

### Maintenance

- Adopt Semifold for coordinated alpha releases and migrate repository-owned tooling implementation to TypeScript while retaining JavaScript consumer outputs.
