# Changelog

## v0.1.0-alpha.10

### Fixes

- Compile functional :host selectors in scoped styles and reject unsupported forms with a source-oriented error.

### Dependencies

- Update vooya-build-core to 0.1.0-alpha.10.
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

- Update vooya-build-core to 0.1.0-alpha.9.
- Update vooya-compiler to 0.1.0-alpha.9.
- Update vooya-core to 0.1.0-alpha.9.
