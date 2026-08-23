# FAQ and troubleshooting

## Do I need Rust installed?

Yes, for the current source-authoring path. A local project compiling `.rs`
files needs Cargo, a stable Rust toolchain, the `wasm32-unknown-unknown` target,
and the pinned `wasm-bindgen-cli`. A future precompiled component product may
remove that requirement for consumers; it is not published yet.

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

`.voo` was an exploratory intermediate format while the island model was being
validated. It is not the current authoring path. New components use ordinary
Rust files, role attributes, and `rsx!`; remaining `.voo` references are
historical or regression evidence.

## Why did `vooya doctor` fail?

Run it from the application root and read the selected Cargo/rustc paths first.
Common causes are a missing WASM target, a missing or mismatched
`wasm-bindgen-cli`, or (on Windows MSVC) a missing Visual Studio C++ linker.
Use `--cargo-path` when the Cargo selected by the plugin is not the one you
intend to use.

## Is Webpack or Rspack supported?

Both have experimental first-party adapters with named fixtures. Vite remains
the primary path. Check the [compatibility matrix](./project/compatibility)
before choosing a bundler; do not infer support for unlisted versions,
Turbopack, Rollup, SSR, or hydration.

## Does Vooya make my app faster?

Not automatically. The value is an explicit Rust/WASM capability boundary,
reuse of Rust libraries, and ownership of a suitable local island. Measure a
real workload against a real host baseline before making a performance claim.

## How do I report a problem?

Include the exact Vooya package versions, Node/Rust/wasm-bindgen versions,
framework and bundler versions, operating system, a minimal reproduction, and
the command that failed. Redact tokens, private paths, and unrelated logs.
