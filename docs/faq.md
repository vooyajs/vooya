# FAQ and troubleshooting

## Do I need Rust installed?

Yes, for the published 0.1 beta source-authoring path. A local project compiling `.rs`
files needs Cargo, a stable Rust toolchain, the `wasm32-unknown-unknown` target,
and the pinned `wasm-bindgen-cli`. The optional
managed preset in the [0.2 source work](./project/next-release.md) prepares Rust
tools; it does not turn a source build into a Rust-free build.

The current development line has retired the dedicated component-package builder.
Authors who distribute a component manage its JS/WASM entry points, assets,
declarations and npm package metadata themselves.

## Do I need to install TypeScript?

No. TypeScript is used to build Vooya's repository tooling and to type-check a
consumer project when the consumer chooses to use TypeScript. The generated
declarations are consumed by the project's own TypeScript/Vue language service.
Configure `rootDirs` to include `.vooya/types`; Vooya does not silently rewrite
your `tsconfig`.

## Why is a `.vooya/` directory created?

It is the application-local generated workspace. It keeps declarations,
intermediate WASM output, metadata, and cache files out of the source tree.
Treat it as generated state; do not hand-edit it or commit it unless a project
explicitly chooses to do so.

## What happened to `.voo`?

The custom format, parser, formatter, and loader branches have been removed from
the current development line. Components and Stores use ordinary `.rs` files,
role attributes, and referenced CSS. Historical releases are unchanged; see the
[migration guide](./project/retired-authoring.md).

## Why did `vooya doctor` fail?

Run it from the application root and read the selected Cargo/rustc paths first.
Common causes are a missing WASM target, a missing or mismatched
`wasm-bindgen-cli`, or (on Windows MSVC) a missing Visual Studio C++ linker.
Use `--cargo-path` when the Cargo selected by the plugin is not the one you
intend to use.

## Is Webpack or Rspack supported?

Both have implemented first-party Rust integrations in the opt-in 0.2 alpha.
Vue/React production paths and Vue watch recovery have browser evidence.
Other framework/watch combinations remain experimental. Vite remains the
primary path; see the [compatibility matrix](./project/compatibility.md).

## Which framework adapters are available?

Vue `>=3.5.2 <4` and React `>=19` are the supported first-party adapters. Solid
`>=1.9 <2` and Svelte `>=5 <6` are experimental on the Vite 7 Rust-file path.
Svelte evidence includes Component and generated Store cleanup after child
unmount. Neither experimental adapter implies Rspack/Webpack, SSR, hydration,
framework meta-framework integration, or broad browser support.

Generated `useName()` entries keep the same names and fields, but not one fake
reactive container: Vue returns a `Ref`, React returns a snapshot, Solid returns
an `Accessor`, and Svelte returns a `Readable` consumed as `$state` in templates.

## Does Vooya make my app faster?

Not automatically. The value is an explicit Rust/WASM capability boundary,
reuse of Rust libraries, and ownership of a suitable local island. Measure a
real workload against a real host baseline before making a performance claim.

## How do I report a problem?

Include the exact Vooya package versions, Node/Rust/wasm-bindgen versions,
framework and bundler versions, operating system, a minimal reproduction, and
the command that failed. Redact tokens, private paths, and unrelated logs.
