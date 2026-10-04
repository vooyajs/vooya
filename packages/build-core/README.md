# @vooya/build-core

Compatibility entry point for Vooya's Rust build API. The implementation lives
in `@vooya/provider-rust`; this package re-exports the same functions, types, and
error classes.

Existing imports and application configuration continue to work. Bundler
integrations can keep using this entry point during the provider transition.
This package is still Rust-specific and does not expose a public provider
registry.
