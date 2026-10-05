# @vooya/provider-rust

## 0.2.0-alpha.0

### Minor Changes

- 4230642: Move Rust compilation, schema handling, workspace management, and toolchain
  selection into `@vooya/provider-rust`. Keep `@vooya/build-core` as a compatible
  entry point sharing the same functions, error classes, and cache. Existing
  Rust projects need no configuration changes. This extraction does not add a
  public provider registry or support for another source language.

### Patch Changes

- d2f41cf: Normalize public module paths as well as their source-root prefix so dot segments do not suppress Rust root exports.

## 0.0.0

Unpublished package. Rust build implementation extracted from `@vooya/build-core`.
