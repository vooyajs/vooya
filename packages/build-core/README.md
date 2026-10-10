# @vooya/build-core

Compatibility entry point for Vooya's Rust build API. The implementation lives
in `@vooya/provider-rust`; this package re-exports the same functions, types, and
error classes.

Existing imports and application configuration continue to work. Bundler
integrations can keep using this entry point during the provider transition.
This package is still Rust-specific and does not expose a public provider
registry.

The compatibility API preserves the current application-local aggregate WASM
artifact. It does not define lazy or independently loadable authored roots; see
[Issue #106](https://github.com/vooyajs/vooya/issues/106) for that separate
architecture work.
