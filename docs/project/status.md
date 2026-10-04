# Project Status

The first Vooya beta, `0.1.0-beta.0`, was published for all ten public packages.
The current npm `beta` channel has `@vooya/vite`, `@vooya/react`, `@vooya/solid`,
and `@vooya/svelte` at `0.1.0-beta.2`, and `@vooya/vue` at `0.1.0-beta.1`.
The other five packages (`@vooya/core`, `@vooya/compiler`, `@vooya/build-core`,
`@vooya/rspack`, and `@vooya/webpack`) remain at `0.1.0-beta.0`. Use each package's npm `beta` tag. It remains a prerelease, not a stable compiler or a
production compatibility promise. The main branch may contain unreleased work.

Vue and React are supported first-party adapters. Solid and Svelte are shipped
experimental adapters, not unfinished package placeholders: their Rust-file
components, events, Store actions, reactive snapshots, and declarations have
browser evidence. Their tested scope is narrower; see the
[framework capability matrix](compatibility.md#beta-framework-capabilities).

The [beta.0 release workflow](https://github.com/vooyajs/vooya/actions/runs/36614375254)
passed the full release gate, all four framework browser fixtures, and clean
Vue/React consumers using both packed artifacts and exact npm versions.
Solid/Svelte do not yet have that separate clean npm-consumer acceptance step.

The [beta.1 release run](https://github.com/vooyajs/vooya/actions/runs/36997152925)
passed the release gate, exact registry-consumer verification, and GitHub Release
publication for the updated package set. This is release evidence for those
versions; it does not expand the framework compatibility matrix.

The current versions include two fixes found while integrating Vooya Lab:
Vite preserves explicit [`?raw` Rust source imports](https://github.com/vooyajs/vooya/pull/142),
and the four adapters accept [generated Store interfaces](https://github.com/vooyajs/vooya/pull/143)
without an arbitrary string index signature. The Store type fix is available
since Vue beta.1 and React/Solid/Svelte beta.2; the raw import fix requires Vite beta.2.

The ten public packages share one release workflow:

- `@vooya/compiler`
- `@vooya/core`
- `@vooya/build-core`
- `@vooya/vite`
- `@vooya/vue`
- `@vooya/react`
- `@vooya/solid`
- `@vooya/svelte`
- `@vooya/rspack`
- `@vooya/webpack`

Package versions may differ. Build packages pin internal dependencies exactly;
install the documented package tags instead of forcing every package to the
same version. Release checks verify the complete dependency graph.

Changesets 3.0.3 manages independent package versions and changelogs, with no
fixed or linked version groups. Published source and dependency changes carry
package-scoped release notes. The **Release** workflow prepares a release PR
on `main`; merging that PR runs the full gate and publishes the reviewed
prerelease channel,
followed by exact registry checks and per-package GitHub Releases. The receipt
records the tested commit and verified package set. This automation does not
promote a prerelease to stable or expand the compatibility claims below.
See [the release guide](../maintainers/releases.md).

## Working today

- Compile Rust-file components and stores into application-level WASM.
- Generate typed mount, prop update, event, dispose, and ABI bindings.
- Import one `.rs` file as a Vue 3, React 19, Solid 1.9, or Svelte 5 component through Vite.
- Generate mirrored TypeScript declarations under `.vooya/types` from
  component contracts.
- Compile optional PostCSS-based scoped styles.
- Map extracted Rust diagnostics back to `.rs` source lines.
- Configure registry, Git, and application-relative path dependencies.
- Recover from Rust build errors and coalesce rapid development saves.
- Validate Vue Counter, React Counter, TaskList, and 100,000-row DataGrid flows
  in real browsers.
- Validate loop-created Rust listeners, cloned event dispatch, and repeated
  mount/unmount behavior in both Vue and React browser fixtures.
- Ship `vooya doctor` for coherent Cargo-selected Rust target, CLI-version, and rustup-path diagnostics.
- Demonstrate a Vue-hosted 150,000-point Rust/WASM Canvas scatter plot.
- Use [Vooya Lab](https://vooyajs.github.io/vooya-lab/) as a
  self-hosting and evidence program; Lab findings that affect product contracts
  return here as focused issues and fixes.
- Build packed npm artifacts from a project outside the repository checkout.
- Verify a test-only precompiled Vue WASM consumer in a clean Vite project
  without Cargo, Rust, a Rust target, `wasm-bindgen`, or the Vite plugin.
- Extract versioned Rust-file schema records from WASM, validate file groups,
  and generate central `.d.rs.ts` declarations for Vue, React, Solid, and Svelte
  consumers.
- Build and exercise a real Rust-file component and store through Vite 7 + Vue
  3.5, including scoped CSS, the public `vooya` authoring dependency, generated
  WASM bindings, and Chromium interaction.
- Build and exercise Rust-file components and instance-scoped stores through
  Vite 7 + React 19, including StrictMode mount cleanup, store actions,
  snapshot subscriptions, and atomic component prop patches.
- Build and exercise a Rust-file Component and instance-scoped Store through
  Vite 7 + Solid 1.9, including a callback event, generated `Accessor`
  declaration, Store action, and Accessor-driven DOM update. Adapter unit tests
  cover owner cleanup and a Store that resolves after its owner is gone.
- Build and exercise a Rust-file Component and instance-scoped Store through
  Svelte 5 + Vite 7, including callback delivery, Store action, Component prop
  update, generated `Readable` declarations, and Chromium without runtime
  errors. The same fixture unmounts a child and verifies exactly one Component
  handle disposal plus one generated Store disposal.
- Verify Rust-file Vite development rebuilds, failed-build recovery, and
  successful full reloads without preserving component state.
- Expose the instance-scoped Store contract to Vue, React, Solid, and Svelte through
  generated `useName()` entries with aligned names and fields; retain each
  framework's native `Ref`, snapshot, `Accessor`, or `Readable` state container and keep
  `useVooyaStore` as an advanced adapter-level helper.
- Generate a Vite virtual module for `.rs` stores, including independent
  factory creation, snapshot reads, subscriptions, actions, and disposal.
- Reconcile the generated Rust root and copied module tree when `.rs` files are
  added, removed, or renamed.
- Exercise the DOM-only `rsx!` runtime in Chromium, including signal bindings,
  owned disposal, conditional branches, and keyed list identity.

## Current limits

- Source consumers need Cargo, the WASM target, and `wasm-bindgen-cli`.
- Vite `>=7 <9` is the supported source-authoring bundler range, with Vite 8
  as the primary compatibility target. Vite 7 Rust-file Vue, React, Solid, and Svelte
  production/browser fixtures pass, and the packed Vite 8 fixture covers
  production, rebuild, HMR, and error recovery. Rspack `>=2.1.10`
  has an experimental first-party adapter with Rsbuild, Rslib, and direct
  Rspack fixtures. Webpack `>=5` has an experimental first-party
  adapter. Webpack 4, Rollup, Turbopack, and other bundlers remain unsupported.
- Vite+ has a compatibility smoke path because it aliases Vite to its bundled
  Vite core; it is not a separate Vooya bundler integration or a promise that
  every Vite+ workflow is supported.
- Turbopack has no compatibility claim. Its loader API evidence and unverified integration requirements are
  recorded in [Turbopack research](turbopack-research.md); Webpack and Rspack
  evidence must not be generalized to Turbopack.
- No precompiled component product is currently published; the retained Vue
  fixture is build-contract evidence, not a user-facing package.
- A non-trivial component still uses some direct `web_sys` APIs.
- Props, event payloads, action arguments, and store snapshots share the
  owned ABI v1 mapping for finite numbers, bigint, nullability, vectors,
  tuples, and string-key maps. User-defined recursive schemas, borrowed
  values, arbitrary generics, non-string maps, and TypedArray transport remain
  outside the current boundary.
- Rust Store schema/declarations and generated `.rs` Store modules are
  available for Vue, React, Solid, and Svelte. Browser-level interaction is
  covered by `test:rust-vue`, `test:rust-react`, `test:rust-solid`, and
  `test:rust-svelte`; Solid and Svelte claims remain limited to their Vite 7
  fixtures and named adapter tests.
- The public `vooya` Cargo authoring crate is copied into the packed
  `@vooya/core` source bundle during the package build, so clean npm consumers
  can compile `.rs` files without a checkout of this repository. It is not a
  separately published Rust crate.
- Reactive dependencies and cleanup are explicit; `batch` coalesces synchronous
  signal writes, re-entrant effect cycles are suppressed, and opt-in
  `tracked_effect` collects dynamic dependencies. `rsx!` now compiles keyed
  `for` loops and conditional `if`/`else` branches with owned cleanup.
- Successful Rust HMR performs a full reload and loses component state; the
  Rust-file recovery path is covered by `test:rust-hmr`.
- `vooya doctor` is a local diagnostic and deterministic PATH candidate selector,
  not a toolchain installer; it warns when its valid Cargo choice differs from
  the first Cargo on `PATH`.
- SSR, hydration, slots, SvelteKit integration, and standalone application
  rendering are out of the current evidence boundary.
- Prerelease ABI revisions can be breaking.
- The default CI browser evidence is a small Chromium smoke suite plus the
  bundler integration fixtures. Extended DataGrid, scatter, trace, and Firefox
  checks remain available through explicit manual commands.
- Vooya Lab cases are evidence and product discovery, not a separate support
  matrix or an automatic beta gate; see [RFC 0011](../rfcs/0011-lab-self-hosting-program.md).

## Next milestones

Beta.0 passed strict TypeScript checks and Chromium interaction for clean
Rust-file Vue and React consumers, first with packed artifacts and then with
exact registry versions. Future releases retain these separate acceptance steps.
Extending clean packed/registry consumer coverage to Solid and Svelte is follow-up
work before considering a broader support claim.
Managed toolchain installation through `@vooya/preset` remains a separate
`0.2` workstream in [#129](https://github.com/vooyajs/vooya/issues/129), not a
prerequisite for this beta. Source consumers still need the Rust/WASM toolchain.

1. Extend the existing `rsx!` conditional/keyed rendering and owned cleanup
   with evidence from more real component use cases.
2. Design a supported, explicitly named component product on top of the generic
   precompiled Vue producer.
3. Define state-preserving HMR semantics.
4. Extend the shipped owned struct/unit-enum declarations and scoped-name
   lookup where real consumers need richer Rust type resolution; recursive and
   borrowed values still require an ownership design.
5. Expand browser and framework coverage beyond the named fixtures. The existing
   Vue 3.6/Vapor smoke remains experimental; it does not establish full support.

The benchmark result remains deliberately modest: the first 100,000-row case
showed approximate parity with its Vue baseline. See the
[recorded result](../benchmarks/2026-07-data-grid.md) rather than assuming WASM
is automatically faster.
