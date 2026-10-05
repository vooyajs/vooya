# @vooya/preset

## 0.2.0-alpha.0

### Minor Changes

- 0c50316: Add an optional managed Rust/WASM toolchain with pinned downloads, an isolated cache, and shared automatic selection for builds and doctor. Projects may explicitly select their system toolchain. Host linker/SDK prerequisites still apply.

### Patch Changes

- 5d99eef: Generate the managed-toolchain JavaScript and public declarations from strict TypeScript source. Keep the existing package entry points and runtime behavior while checking every installer module during the package build.

## 0.0.0

Unpublished package. Initial managed toolchain implementation.
