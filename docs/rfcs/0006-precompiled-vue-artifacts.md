# RFC 0006: Retired precompiled Vue package experiment

## Status

Retired on the current development line. The experimental
`buildPrecompiledVueArtifact` and `validatePrecompiledVueArtifactOutput` exports
have been removed from `@vooya/vite/build`, along with the dedicated Vue
consumer fixture and its test command. Previously published packages and
historical changelogs retain their original behavior.

## Scope decision

Vooya focuses on Rust source authoring, typed framework integration, lifecycle
and diagnostics. The optional `@vooya/preset` prepares a pinned native Rust/WASM
toolchain; it does not package or publish components.

Authors who want to distribute a component can organize their own JavaScript
wrapper, WASM, CSS, declarations, package exports and runtime dependencies, then
use normal npm tooling. Vooya does not require a dedicated component-package
manifest or provide a component publisher.

The general `@vooya/vite/build` exports and shared Rust build APIs remain.
Provider-owned loaders and asset collections are separate internal research;
retiring this product-package experiment does not remove the assets needed by
ordinary source builds or change the component ABI.

## Historical evidence

The initial alpha specimen was published as `@vooya/artifact-vue-counter` and
later retired from the coordinated release unit because it demonstrated a build
contract rather than a useful component product. A generic Vue producer and a
test-only consumer fixture were retained temporarily. They are now removed
instead of being expanded into a dedicated package-distribution workflow.
