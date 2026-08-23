# Changelog

## v0.1.0-alpha.11

### Features

- Unify generated instance-scoped store hooks across the Vue and React adapters, document the Rust-file authoring and attribute-marker contracts, and harden late lifecycle callback handling and release verification for clean-machine quickstarts.

### Dependencies

- Update vooya-compiler to 0.1.0-alpha.11.
- Update vooya-core to 0.1.0-alpha.11.

## v0.1.0-alpha.10

### Fixes

- Compile functional :host selectors in scoped styles and reject unsupported forms with a source-oriented error.

### Dependencies

- Update vooya-compiler to 0.1.0-alpha.10.
- Update vooya-core to 0.1.0-alpha.10.

## v0.1.0-alpha.9

### Features

- Move generated application state into a disposable `.vooya/` workspace and mirror component declarations under `.vooya/types` instead of writing them beside source `.voo` files.
- Add the first experimental Webpack 5 source `.voo` integration for Vue and React, including production output, browser lifecycle coverage, Rust failure recovery, watched path dependencies, and documented compatibility bounds.

### Fixes

- Apply declared .voo prop defaults in the React adapter before mount, matching the Vue adapter.

### Maintenance

- Rename @vooya/vite-plugin to @vooya/vite.

### Dependencies

- Update vooya-compiler to 0.1.0-alpha.9.
- Update vooya-core to 0.1.0-alpha.9.

## v0.1.0-alpha.8

### Features

- Publish complete TypeScript declarations for the compiler and Vite plugin, remove duplicated generated JavaScript from source control, and add the first public contribution and issue-reporting workflow.
- Add the first experimental Rspack 2.1 source `.voo` integration for Vue and React, backed by the shared Rust/WASM build core, strict packed fixtures, browser lifecycle checks, mapped diagnostics, and configured Rust path dependencies.

### Fixes

- Verify Vite 8 source authoring, keep the runtime ABI entry browser-light, and record the Vite+ compatibility smoke path without presenting it as a separate bundler adapter.

### Dependencies

- Update vooya-compiler to 0.1.0-alpha.8.
- Update vooya-core to 0.1.0-alpha.8.
