# Project Status

Vooya is a public alpha and an architecture-validation project. It is not a
stable compiler or a production compatibility promise.

The four packages form one coordinated release unit:

- `@vooya/core`
- `@vooya/vite-plugin`
- `@vooya/vue`
- `@vooya/react`

Use the same exact version for every package. The npm `alpha` dist-tag identifies
the latest published set, while `main` can contain changes queued for the next
prerelease.

## Working today

- Compile Rust directly from `<rust>` blocks into application-level WASM.
- Generate typed mount, prop update, event, dispose, and ABI bindings.
- Import one `.voo` file as a Vue 3 or React 19 component.
- Generate adjacent TypeScript declarations from component contracts.
- Compile optional PostCSS-based scoped styles.
- Map extracted Rust diagnostics back to `.voo` source lines.
- Configure registry, Git, and application-relative path dependencies.
- Recover from Rust build errors and coalesce rapid development saves.
- Format `.voo` files and package a VS Code syntax extension.
- Validate Vue Counter, React Counter, TaskList, and 100,000-row DataGrid flows
  in real browsers.
- Build packed npm artifacts from a project outside the repository checkout.

## Current limits

- Source consumers need Cargo, the WASM target, and `wasm-bindgen-cli`.
- A non-trivial component still uses some direct `web_sys` APIs.
- The contract is limited to primitive prop and event values.
- Reactive dependencies and cleanup are explicit and minimal.
- Successful Rust HMR performs a full reload and loses component state.
- The VS Code extension does not bridge `.voo` Rust into rust-analyzer.
- SSR, hydration, slots, and standalone application rendering are out of scope.
- Alpha ABI revisions can be breaking.

## Next milestones

The maintained implementation checklist lives in the [project roadmap](roadmap.md).
The immediate priorities are:

1. Grow the Rust view layer into declarative trees, reactive bindings, and
   explicit effect cleanup.
2. Define precompiled component artifacts so application consumers do not need
   a Rust toolchain.
3. Bridge extracted Rust source to rust-analyzer for completion, navigation,
   and diagnostics.
4. Define state-preserving HMR semantics.
5. Expand component contracts beyond primitive values.
6. Establish and continuously test a browser and framework compatibility
   matrix.

The benchmark result remains deliberately modest: the first 100,000-row case
showed approximate parity with its Vue baseline. See the
[recorded result](../benchmarks/2026-07-data-grid.md) rather than assuming WASM
is automatically faster.
