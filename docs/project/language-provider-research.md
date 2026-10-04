# Language Provider Research

This record scopes the post-beta research in [Issue #94](https://github.com/vooyajs/vooya/issues/94).
It is not an implementation of a second authoring language or a change to the
beta support matrix.

## Current Boundary

Vooya beta is Rust-only. Rust source files, Cargo, `wasm-bindgen`, Rust schema
records, and Rust diagnostics are the only supported source-authoring path.
A language is not supported merely because it can compile to WebAssembly or
because an experiment can load its output in a browser.

`@vooya/provider-rust` now owns Rust source discovery, generated Cargo
manifests, Cargo execution, `wasm-bindgen`, Rust schema extraction, declaration
generation, and Rust diagnostic mapping. `@vooya/build-core` re-exports its
existing public API. Both packages remain Rust-specific; separating package
ownership does not establish a language-neutral protocol.

The dependency direction is `build-core → provider-rust → compiler/core`.
There is no provider-to-build-core dependency. Workspace management, locking,
errors, and the toolchain cache move with Rust because they currently share Rust
schema and toolchain assumptions. The compatibility entry uses the same
functions and classes, preserving error identity and cache clearing. Generated
`.vooya` paths, metadata, and the precompiled Vue artifact format do not change.
Bundler packages and application configuration continue to use their existing
entry points.

## Proposed Split

The target architecture separates four responsibilities:

| Layer | Owns | Must not own |
| --- | --- | --- |
| Language provider | Source discovery, toolchain policy, compilation, language runtime assets, language diagnostics, source maps, dependency/watch inputs, and conversion into the Vooya ABI contract | Framework-specific mounting or a bundler's virtual-module API |
| Normalized artifact | Runtime entry points, WASM and auxiliary assets, contract metadata, declarations, environment requirements, watch files, and normalized diagnostics | Cargo, Rust macros, a particular compiler, or a requirement that all providers instantiate WASM directly |
| Bundler integration | Virtual modules, asset emission, development invalidation, error presentation, and adapter imports | Source compilation details for a particular language |
| Framework adapter | Component/store lifecycle, event delivery, prop updates, disposal, and framework-native state containers | Provider toolchain selection or language runtime loading policy |

The provider loader remains provider-specific. For example, an Emscripten
provider can require generated JavaScript, workers, and data files; a Go
provider can require its version-matched support script; a managed runtime can
ship additional runtime assets. A single generated `WebAssembly.instantiate()`
call is not a sufficient universal loader contract.

## Normalized Artifact Requirements

Before adding a second language or replacing the existing artifact format,
define a versioned artifact manifest with at least these fields:

| Field | Purpose |
| --- | --- |
| `schemaVersion` and ABI versions | Reject incompatible artifacts deterministically |
| Runtime entry | Identify the provider-supplied JavaScript module and its loading contract |
| Assets | Describe WASM, JavaScript, CSS, worker, data, source-map, and runtime files with stable identities |
| Contracts and declarations | Provide component/store metadata and generated TypeScript declarations without requiring Rust macros |
| Environment requirements | State browser, worker, threading, COOP/COEP, runtime, and offline-asset requirements explicitly |
| Watch inputs | Let bundlers invalidate on authored source, provider dependencies, manifests, and generated input changes |
| Diagnostics | Normalize severity, source location, rendered message, and generated-to-authored mappings |
| Cache identity | Include provider version, toolchain inputs, build mode, and relevant environment so stale artifacts cannot be reused |

The manifest is an internal proposal until an RFC assigns its wire format and
compatibility policy. It must support precompiled artifacts as well as source
providers; a precompiled consumer must not require Cargo or a source provider.

## Rust Reference Provider

Rust is the first extraction target. The refactor must preserve existing public
behavior before another provider is introduced:

- ordinary `.rs` component and store authoring remains unchanged;
- `toolchain.cargoPath` and `vooya doctor` continue to select and diagnose one
  coherent Cargo/rustc/target/`wasm-bindgen` toolchain;
- generated workspace paths, `vooya clean`, metadata, declarations, and
  diagnostics remain compatible with beta consumers;
- Vite remains the primary source-authoring evidence path;
- the existing Rust lifecycle, ABI, CSS, watch, failure-recovery, and browser
  fixtures pass without a new user configuration value; and
- no adapter imports Cargo, Rust schema parsing, or `wasm-bindgen` directly
  after the extraction boundary is complete.

The internal Rust seam and package extraction preserve the current synchronous
build API. The internal artifact still assumes one JavaScript module and one
WASM asset. These interfaces are not exported as a public provider protocol.
A public `provider` option needs a second implementation passing the same
conformance cases.

## API Changes to Validate Next

Keep `vooya()`, `rust`, `toolchain.cargoPath`, and framework adapter APIs
compatible during the package extraction. Moving a function between packages
must not require application authors to add a provider setting.

A second provider will need more than renaming `RustBuildOptions`. Validate
these changes in an internal consuming path before publishing an extension API:

- An asynchronous preparation/build boundary for toolchain preparation and
  runtime assets, while retaining the existing synchronous Rust entry point.
- A provider-supplied loader and asset collection, instead of assuming a
  `wasm-bindgen` default initializer and one WASM file.
- Component/store contracts independent of Rust custom sections, including
  readiness, values, notifications, failures, and disposal.
- Provider/toolchain identity in caches, complete watch inputs, and diagnostics
  with authored source locations.

The existing [precompiled Vue artifact](../rfcs/0006-precompiled-vue-artifacts.md)
is already a consumer format. Reconcile its version and compatibility rules
before introducing a second serialized manifest. A future language-neutral
build-core should stop depending on the default Rust implementation; the
current compatibility facade is an intermediate step toward that boundary.

## Go Experiment

Go is a useful next experiment because it challenges Rust's loading assumptions.
Start with the standard Go compiler and a browser `js/wasm` target. The official
[Go WebAssembly guide](https://go.dev/wiki/WebAssembly) requires a matching
`wasm_exec.js` support script and runs the instance through `Go.run`. Successful
instantiation alone is not the Vooya readiness or disposal contract. WASI is a
separate target and does not supply a browser component integration.

The first experiment should adapt a small existing Go calculation or parser as
a Store, with Vue and React consumers. Test typed inputs/results, one snapshot
notification per change, independent instances, cancellation during loading,
disposal, remounting, and development rebuild after a compile error. Use a
schema sidecar or generated contract rather than depending on Rust macros.
The bridge must release registered callbacks as described by
[`syscall/js.Func.Release`](https://pkg.go.dev/syscall/js#Func.Release), and
separately define runtime lifetime during HMR. Releasing a Store is not proof
that the Go runtime has stopped.

Measure emitted size, startup, rebuild time, and whether the intended Go library
actually compiles. Compare TinyGo only after this baseline; its
[WASM guide](https://tinygo.org/docs/guides/webassembly/wasm/) specifies its own
support script. Go and TinyGo should not be treated as interchangeable compiler
switches without separate lifecycle and library-compatibility evidence.

This is a proposed experiment, not implemented Go support. Keep the existing
AssemblyScript and Emscripten canaries as alternative tests of the same seam;
there is no requirement to implement all three before learning from one.

## Preset Package Boundary

Keep one optional `@vooya/preset` for the currently supported Rust tools. It
prepares pinned compiler binaries; `@vooya/provider-rust` translates source into
Vooya artifacts. These are separate jobs. Using system tools must continue to
work without installing a preset, and importing a provider must not download a
toolchain. Preserve project-level preset discovery and `auto/system/managed`
selection during extraction.

Do not add Go downloads to the existing preset just because the provider
boundary exists. If the Go experiment becomes supported and managed Go tools
are needed, use independently installed language toolchain packages (for
example `@vooya/preset-rust` and `@vooya/preset-go`). Each would own its versions,
checksums, host coverage, and cache identity. `@vooya/preset` could retain the
Rust default as a compatibility/convenience entry; it should not install every
language's tools. A shared downloader can be factored out when both
implementations demonstrate common requirements.

## Canary Evidence

Two deliberately different experiments are needed to validate the seam rather
than merely duplicate Rust's output shape.

### AssemblyScript Store Canary

An AssemblyScript provider should implement the shared store case with snapshot
`{ value: i32, label: string }`, `add(delta)`, and `reset()` actions. It must
prove one notification per change, generated Vue and React hooks with the same
shape as Rust stores, deterministic disposal, and clean development and
production builds. AssemblyScript is TypeScript-like; ordinary TypeScript is
not automatically a Vooya source language.

### Emscripten Worker Canary

An Emscripten C/C++ provider should wrap one small real image or parsing
library in a worker. It must prove provider JavaScript glue, multiple emitted
assets, asynchronous failure cleanup, typed values without silent coercion,
source diagnostics, cache invalidation, production/offline loading, and
COOP/COEP behavior when pthreads are enabled.

Passing either canary makes that provider experimental evidence only. Neither
canary changes the beta Rust-only support boundary.

## Explicit Non-goals

- Supporting arbitrary WebAssembly as a Vooya component.
- Treating WASI as a browser DOM integration or requiring every provider to use
  the WebAssembly Component Model.
- Reimplementing framework adapters for each language.
- Promising offline execution unless all required assets, runtimes, standard
  libraries, packages, and data files are deployed or cached.
- Running untrusted provider output without a separate sandbox and resource
  model.
- Promoting Lab or community experiments to first-party support without a
  provider, documentation, release status, and automated evidence.

## Exit Criteria

The research can advance to an architecture RFC only when it specifies the
artifact manifest, provider lifecycle, cache and clean behavior, watch and
diagnostic model, and compatibility policy. The first implementation stage is
complete only when the Rust reference provider preserves beta fixtures and a
precompiled artifact can be consumed without Cargo. AssemblyScript and
Emscripten require the same lifecycle and ABI conformance suite before either
is described as an experimental first-party provider.
