# Roadmap

Vooya's goal is to bring Rust capabilities into existing frontend applications,
one component at a time. This roadmap separates the stable component boundary
from optional view syntax, host adapters, build integrations, and distribution.

The checkboxes describe repository evidence, not aspirations: an item is checked
only when its implementation and relevant tests exist on `main`.

## Component contract and ABI

- [x] Mount one Rust component into one host-owned element.
- [x] Forward primitive props from the host to Rust.
- [x] Forward typed Rust events to Vue emits and React callbacks.
- [x] Dispose component handles, DOM, and owned listeners on unmount.
- [x] Reject incompatible generated WASM through an ABI version check.
- [ ] Define structured and collection prop/event values.
- [ ] Define binary-data transfer without JSON serialization.
- [ ] Define asynchronous component initialization and cancellation.
- [ ] Browser-test load, ABI, and Rust mount failure behavior in every host.
- [ ] Measure and bound shared-WASM and per-island lifecycle overhead.

## Authoring and view layer

Vooya will keep one host-neutral Rust implementation. Vue templates and React
JSX are consumption syntax; they will not produce separate Rust component
languages.

- [x] Support imperative structured DOM construction through `View` and
  `ViewElement`.
- [x] Provide explicit `Signal<T>` and `Effect` primitives.
- [ ] Design one optional, host-neutral declarative view syntax.
- [ ] Compile static view structure to direct DOM creation.
- [ ] Add fine-grained text, attribute, class, and property bindings.
- [ ] Add conditional branches and keyed lists.
- [ ] Add effect cleanup and owned resource registration.
- [ ] Preserve component state across successful Rust development rebuilds.
- [ ] Connect extracted `.voo` Rust to rust-analyzer.

## Host adapters

- [x] Vue 3 lifecycle, props, emits, and scoped styles.
- [x] React 19 lifecycle, props, callbacks, and scoped styles.
- [x] Run the same Rust component contract through Vue and React parity tests.
- [ ] Web Component adapter.
- [ ] Astro integration and island hydration policy.
- [ ] Evaluate Svelte and Solid adapters after Web Component and Astro evidence.

Host support details and known gaps are tracked in the generated
[compatibility matrix](../reference/compatibility.md).

## Build integrations

- [x] Vite source compilation and development rebuilds.
- [x] Application-local Cargo crate and build cache.
- [x] Registry, Git, and application-relative Rust dependencies.
- [ ] Rsbuild/Rspack integration.
- [ ] Library-mode build for independently distributed components.
- [ ] Stable compiler API that build integrations can share.

## Precompiled Component Artifact

A precompiled component artifact is the distributable output of a Vooya
component. The author or CI compiles Rust to WASM once; application consumers
install a normal npm package and do not need Cargo, a Rust target, or
`wasm-bindgen-cli`.

The artifact is expected to contain:

- compiled and optimized WASM;
- a versioned component manifest and ABI version;
- typed props and event declarations;
- generated Vue, React, and future host entry points;
- component styles and asset metadata;
- loading, error, and disposal bindings.

Work required:

- [ ] Specify the versioned artifact manifest.
- [ ] Specify WASM, JavaScript, declarations, styles, and asset layout.
- [ ] Define one-WASM-per-component versus shared-WASM packaging.
- [ ] Generate framework entry points from one artifact.
- [ ] Build and pack an artifact from a real Rust-backed component.
- [ ] Verify installation in Vue and React consumers without a Rust toolchain.
- [ ] Define compatibility rules across compiler, runtime, and adapter versions.
- [ ] Publish authoring and consumer migration guidance.

This is currently a contract and compiler milestone, not a planned empty
`@vooya/package-format` runtime package. A package should be created only when a
real public API and independently versioned responsibility exist.

## Product evidence

- [x] Counter lifecycle examples for Vue and React.
- [x] Reactive TaskList proof component.
- [x] 100,000-row DataGrid benchmark with an honest Vue comparison.
- [ ] Integrate an existing, independently maintained Rust library.
- [ ] Add an editor or parser-backed component.
- [ ] Add a Canvas or WebGL component that does not require a DOM renderer.
- [ ] Add hosted-island tests at 1, 100, and 1,000 component instances.
- [ ] Track startup, bundle size, boundary crossings, listeners, and disposal.
- [ ] Generate a repository-wide support status page from machine-readable
  evidence.

## Package expansion rule

Planned targets may be documented here before implementation. A directory under
`packages/` should be added only when it contains at least one of:

- a publishable runtime or adapter;
- a shared compiler/build integration with tests;
- a versioned public contract consumed by another package.

Every new package must start with a README that states its status, goal, public
contract, non-goals, open questions, and evidence. Empty package directories are
not used as roadmap placeholders.
