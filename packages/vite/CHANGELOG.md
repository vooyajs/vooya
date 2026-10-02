# Changelog

Historical entries were reconstructed from published package metadata and release
snapshots; see [release history evidence](../../docs/maintainers/release-history.md).

Versions before alpha.9 were published as `@vooya/vite-plugin`, not `@vooya/vite`.

## 0.1.0-beta.2

### Patch Changes

- 1515841: Preserve Vite's explicit `?raw` imports of Rust and Voo files as source strings, including eager source-preview globs, instead of compiling them into component or Store modules. Normal component and Store imports continue to compile.

## 0.1.0-beta.1

### Patch Changes

- 30f215b: Add `vooya doctor --json` for machine-readable toolchain diagnostics. The
  versioned report explicitly selects public diagnostic fields and excludes
  internal build objects and the process environment. Failed checks retain a
  nonzero exit status. Reject `clean --json` before removing generated files.
- 83c2127: Keep an already verified WASM target marked as installed when toolchain
  resolution fails because wasm-bindgen is missing or has the wrong version.
  The doctor report still fails overall and identifies the CLI problem without
  incorrectly asking authors to install the Rust target again.

## 0.1.0-beta.0

### Patch Changes

- cca8100: Prepare the first 0.1 beta package set for Rust-file authoring. Keep internal
  dependencies aligned with the reviewed beta versions. Vue and React with Vite
  remain the supported path; experimental adapters retain their documented limits.
  Authors still provide a Rust/WASM toolchain; managed preset installation is
  planned separately for 0.2.
- Updated dependencies [cca8100]
- Updated dependencies [c4a2698]
- Updated dependencies [c4a2698]
- Updated dependencies [1e3e000]
  - @vooya/build-core@0.1.0-beta.0
  - @vooya/compiler@0.1.0-beta.0
  - @vooya/core@0.1.0-beta.0

## 0.1.0-alpha.13

- Preserve authored helper modules in dependency HMR for multi-file Rust components and stores.
- The clean Astro Math Plot consumer verifies dependency HMR and production output from a packed multi-file example.
- Published internal dependencies: `@vooya/build-core@0.1.0-alpha.13`, `@vooya/compiler@0.1.0-alpha.12`, `@vooya/core@0.1.0-alpha.12`.

## 0.1.0-alpha.12

- Support Solid and Svelte Rust-file components and stores through the shared generated bridge contract.
- Prevent repeated Astro environment builds from racing generated WASM cleanup; ignore generated workspace changes during development HMR.
- Use selector-safe virtual CSS IDs and normalize queried Rust module IDs. Add the Astro 7.3 client-island and ordinary-Rust Math Plot consumer proof.
- Published internal dependencies: `@vooya/build-core@0.1.0-alpha.12`, `@vooya/compiler@0.1.0-alpha.12`, `@vooya/core@0.1.0-alpha.12`.

## 0.1.0-alpha.11

- Generate Vue and React instance-scoped store hooks with the same `state`-plus-actions shape.
- Published internal dependencies: `@vooya/build-core@0.1.0-alpha.11`, `@vooya/compiler@0.1.0-alpha.11`, `@vooya/core@0.1.0-alpha.11`.

## 0.1.0-alpha.10

- Support ordinary Rust-file components and stores for Vue and React, including Rust stylesheet dependencies.
- Delegate `.voo` imports to Vite resolution so aliases and package imports retain Vite semantics.
- Published internal dependencies: `@vooya/build-core@0.1.0-alpha.10`, `@vooya/compiler@0.1.0-alpha.10`, `@vooya/core@0.1.0-alpha.10`.

## 0.1.0-alpha.9

- Rename `@vooya/vite-plugin` to `@vooya/vite`; update imports and dependency names when upgrading.
- Move generated state and declarations into `.vooya/`, add workspace cleanup, and resolve toolchains consistently with explicit Cargo-path support.
- Published internal dependencies: `@vooya/build-core@0.1.0-alpha.9`, `@vooya/compiler@0.1.0-alpha.9`, `@vooya/core@0.1.0-alpha.9`.

## 0.1.0-alpha.8

- Published under the former name `@vooya/vite-plugin`.
- Publish complete TypeScript declarations, use the shared build core, and keep the runtime ABI entry browser-light.
- Verify Vite 8 source authoring and the Vite+ compatibility smoke path; diagnose a missing Windows MSVC linker.
- Published internal dependencies: `@vooya/build-core@0.1.0-alpha.8`, `@vooya/compiler@0.1.0-alpha.8`, `@vooya/core@0.1.0-alpha.8`.

## 0.1.0-alpha.7

- Published under the former name `@vooya/vite-plugin`.
- Migrate repository-owned tooling implementation to TypeScript while retaining executable JavaScript outputs; adopt Semifold release coordination.
- Published internal dependencies: `@vooya/compiler@0.1.0-alpha.7`, `@vooya/core@0.1.0-alpha.7`.

## 0.1.0-alpha.6

- Published under the former name `@vooya/vite-plugin`.
- Expose the precompiled Vue artifact build contract, report source Rust build progress, and make doctor executable-path checks portable.
- Published internal dependencies: `@vooya/compiler@0.1.0-alpha.6`, `@vooya/core@0.1.0-alpha.6`.

## 0.1.0-alpha.5

- Published under the former name `@vooya/vite-plugin`.
- Consume the TypeScript-authored compiler and ship MIT/Apache-2.0 license texts.
- Published internal dependencies: `@vooya/compiler@0.1.0-alpha.5`, `@vooya/core@0.1.0-alpha.5`.

## 0.1.0-alpha.4

- Published under the former name `@vooya/vite-plugin`.
- Extract the standalone compiler, add `vooya doctor` toolchain diagnostics, and build portable precompiled component artifacts.
- Harden WASM initialization and ABI checks for generated consumers.
- Published internal dependencies: `@vooya/compiler@0.1.0-alpha.4`, `@vooya/core@0.1.0-alpha.4`.

## 0.1.0-alpha.3

- Published under the former name `@vooya/vite-plugin`.
- Suppress framework HMR before the WASM reload and stabilize generated component-handle teardown.
- Published internal dependencies: `@vooya/core@0.1.0-alpha.3`.

## 0.1.0-alpha.2

- Published under the former name `@vooya/vite-plugin`.
- Unify generated bindings, runtime ABI naming, and adapter imports under Vooya.
- Published internal dependencies: `@vooya/core@0.1.0-alpha.2`.

## 0.1.0-alpha.1

- Published under the former name `@vooya/vite-plugin`.
- Ship source `.voo` compilation, generated Vue/React modules and declarations, scoped CSS, Rust diagnostic mapping, application dependencies, queued development rebuilds, and the formatter.
- Published internal dependencies: `@vooya/core@0.1.0-alpha.1`.

## 0.1.0-alpha.0

- Initial npm publication under the former name `@vooya/vite-plugin`, providing the Vite 7 integration entry.
