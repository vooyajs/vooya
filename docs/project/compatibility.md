# Compatibility matrix

This page records the supported paths and integration tests in this repository.
The beta table describes published packages; the additions below describe
current source awaiting the proposed 0.2 release. Each entry covers its named
consumer path. Check [package versions](status.md) before applying a row;
[release lines](../maintainers/release-lines.md) explains the maintenance boundary.

## Beta framework capabilities

All four adapter packages first shipped at `0.1.0-beta.0` on the npm `beta`
channel. **Published** describes package availability; **supported** describes
the narrower integration contract. Beta does not mean every host-framework
feature is implemented.

| Capability / evidence | Vue 3 | React 19 | Solid 1.9 | Svelte 5 |
| --- | --- | --- | --- | --- |
| Beta support level | Supported | Supported | Experimental | Experimental |
| Rust-file Component mount, prop update, callback/event | Verified | Verified | Verified | Verified |
| Instance-scoped Store actions and reactive snapshots | `Ref` (`state.value`) | Snapshot (`state`) | `Accessor` (`state()`) | `Readable` (`$state`) |
| Generated component/Store declarations, owned struct and unit-enum types | Implemented | Implemented | Implemented | Implemented |
| Lifecycle coverage | Mount/unmount and late Store resolution | StrictMode cleanup and late Store resolution | Owner cleanup and late Store resolution in adapter tests | Component and Store disposed once on child unmount |
| Rust-file production browser fixture | Vite 7 + Chromium | Vite 7 + Chromium | Vite 7 + Chromium | Vite 7 + Chromium |
| Separate clean packed consumer acceptance in the published release | Verified | Verified | Not yet covered | Not yet covered |
| npm-registry consumer acceptance | Verified | Verified | Not yet covered | Not yet covered |
| SSR / hydration / slots in published beta | Not supported | Not supported | Not supported | Not supported |

The [beta.0 release run](https://github.com/vooyajs/vooya/actions/runs/36614375254)
passed `verify:release`, including `test:rust-vue`, `test:rust-react`,
`test:rust-solid`, and `test:rust-svelte`. Adapter tests and the shared
build-core declaration tests supplement these browser fixtures. Publishing all
ten packages and checking their registry metadata does not substitute for the
separate Vue/React clean-consumer tests (`test:packed-release` and `test:registry`).

Beta.0 also preserves React's ready `null` Store snapshot and Vue's omitted
optional Boolean prop (`Option::None`, rather than `Some(false)`). Solid and
Svelte already preserve those values; the React/Vue fixes do not imply those
adapters were absent from earlier builds.

**Unreleased source evidence:** `test:vite8-frameworks` installs Vue, React, Solid and
Svelte in separate clean tarball consumers on Vite 8.2.1. It covers production
Chromium interactions, strict generated declarations, development Rust edits,
compiler-error recovery, rapid saves and host component edits.
Svelte uses `@sveltejs/vite-plugin-svelte` 7.1.2 on Vite 8. npm-registry consumer
acceptance is still pending; both adapters remain experimental. SvelteKit is not covered.
See [Getting started](../guide/getting-started.md) for all four configurations.

## Framework and host-tool minimums

These rows combine published minimums with explicitly marked source-only
experiments. Octane and the newer Vapor fixture are not additions to the
published beta support table above.

| Layer | Minimum version | Status | Evidence and boundary |
| --- | --- | --- | --- |
| Node.js | `^20.19.0 \|\| >=22.12.0` | Supported | Source quickstarts run on Ubuntu + Node 20, macOS + Node 22, Windows + Node 22; the full release gate runs on Ubuntu + Node 22 |
| Vue | `>=3.5.2 <4` | Supported | Strict adapter declaration checks pass from 3.5.2 through 3.5.41; current-source Vue 3.6/Vapor evidence is listed separately below; 3.5.0 and 3.5.1 are outside the supported type boundary |
| React | `>=19` | Supported | Browser fixtures cover 19.0.0 and 19.2.0; React 18 is below the supported minimum |
| Solid | `>=1.9 <2` | Experimental | Vite 7 production browser fixture covers a Rust-file component, callback event, and Accessor-backed Store update; adapter unit tests cover owner cleanup and late resolution |
| Svelte | `>=5 <6` | Experimental | Svelte 5 + Vite 7 production Chromium fixture covers Component mount/callback, Store action, Component prop update, generated `Readable` declarations, and Component/Store owner cleanup |
| Octane | `0.9.0` | Private workspace experiment; excluded from 0.2 | Independent packed fixture with `@octanejs/vite-plugin` 0.2.1 on Vite 8.0.16 covers Component/Store isolation, props/events, disposal/remount and strict declarations; Node >=22.22.2; no npm release or SSR claim |
| React 19 Rust-file authoring | Vite 7 | Supported beta path | Production build and browser interaction cover an instance-scoped store, `useSyncExternalStore`, atomic component prop updates, and StrictMode cleanup |
| Vue Vapor | Vue 3.6 experimental | Current-source fixture, experimental | Vite 8 + Vue 3.6.0-beta.17 mounts a Rust-file component when the app uses Vue's `vaporInteropPlugin`; Vapor remains an upstream Vue opt-in |

## Current-source browser fixtures

Commands in this section run the checkout, including unpublished changes.
Only the release evidence above establishes the npm beta boundary.

| Consumer path | Verified behavior | Evidence |
| --- | --- | --- |
| Vue 3 Rust-file component/store | Vite 7 production build, scoped CSS, store action and snapshot-driven component update | `npm run test:rust-vue`; packed source quickstarts run on the OS/Node jobs in `.github/workflows/verify.yml` |
| React 19 Rust-file component/store | Vite 7 production build, StrictMode mount, store action and snapshot-driven component update | `npm run test:rust-react` |
| Solid 1.9 Rust-file component/store | Vite 7 production build, callback event, Store action, and signal/Accessor-driven DOM update; adapter tests cover owner-scoped disposal | `npm run test:rust-solid`; `npm run test:solid` |
| Svelte 5 Rust-file component/store | Vite 7 production build, callback event, Store action, prop update, `Readable` declaration, no Chromium runtime error, and exactly one Component handle plus generated Store disposal after child unmount | `npm run test:rust-svelte` |
| Octane 0.9 Rust-file component/store | Native client components and Stores, independent instances, prop/event updates, generated types and unmount/remount | `npm run test:rust-octane` (independent private experiment, outside the public release gate) |
| Rust-file Vite development path | Rust source edit, failed rebuild recovery, subsequent successful rebuild, and full reload | `npm run test:rust-hmr` |
| Rust `rsx!` DOM runtime | Signal text/attribute updates, owned events, conditional `if`/`else`, keyed `for` reorder and DOM identity, disposal | `npm run test:rsx` |
| Vue TaskList | Reactive state, keyed rows, filtering, validation error state | `npm run test:e2e` (tasks target) |
| Vue DataGrid | Filter, sort, virtual scroll, local measurement control | `npm run test:e2e` (benchmark target) |
| Vue Canvas scatter | 150,000-point initial island, point-count update, zoom/reset, no page or console error | `npm run test:e2e:scatter` |
| Vue precompiled build fixture | Generated WASM in a clean Vite consumer without Rust tooling; mount and prop update | `npm run test:precompiled-vue` |

## Rust-file bundler additions

The proposed 0.2 batch adds Webpack/Rspack Rust-file integration. These checks run
against tarballs built from this checkout, not the existing npm Beta artifacts.
`npm run test:rust-bundlers` covers Vue and React on Webpack 5.109.2 and Rspack
2.1.10, including `rust.sourceRoot: "."` with Rust files at the application root.
Vue watch fixtures cover invalid Rust and recovery, linked CSS updates, newly
added `.rs` files, and stable builds after generated output. Applications retain
responsibility for framework transforms, HTML and CSS rules.
SSR/Next.js and state-preserving HMR are not implied.

## Current-source bundler/toolchain matrix

These entries run against tarballs built from the checkout in a fresh temporary
consumer. They are source evidence, not proof that installing npm `@beta`
provides Vite+ four-framework support or Webpack/Rspack Rust-file integration.
The evidence and boundary columns state the exact checks exercised by each
toolchain; a production smoke does not imply development-server or HMR support.

| Toolchain | Version range / tested version | Evidence | Boundary |
| --- | --- | --- | --- |
| Vite | `>=7 <9` | `npm run test:vite8-frameworks`; `npm run test:vite8` | Vite 8.2.1: separate packed Vue/React/Solid/Svelte production, strict types and dev/error-recovery checks. Vite 7 remains a required regression path; the older compatibility smoke is separate. |
| Vite 8 + Vue Vapor | Vite `8.2.1`; Vue `3.6.0-beta.17` | `npm run test:vite8-vapor` | Rust-file component mounts in a Vapor app with `vaporInteropPlugin`; experimental evidence only |
| Vite+ | `0.2.9`, matching core alias `0.2.9` (Vite `8.2.1`) | `npm run test:vite-plus-frameworks`; `npm run test:vite-plus` | Packed Vue/React/Solid/Svelte `.rs` production builds and Chromium interactions, strict declarations, dev rebuilds, Rust error recovery, rapid saves and host component edits. Rust edits use full reload; legacy `.voo` regression is separate. Normal npm installation uses the documented alias/overrides. |
| Rspack / Rsbuild | Rspack `>=2.1.10`; Rsbuild `>=2.1.13` | `npm run test:rspack` | Experimental packed Vue/React/Rslib/native-Rspack fixtures with WASM, scoped CSS, lifecycle checks, mapped diagnostics, and rebuild recovery. `test:rust-bundlers` adds packed Vue/React `.rs` production builds, Stores, props/events, scoped CSS, and unmount/remount; Vue Rust-file watch also covers failure recovery, style edits and new modules; other framework/watch combinations remain unverified. |
| Webpack | `>=5` | `npm run test:webpack` | Experimental packed Vue/React production and watch fixtures with emitted WASM, scoped CSS, lifecycle checks, mapped diagnostics, and recovery. `test:rust-bundlers` adds packed Vue/React `.rs` production builds, Stores, props/events, scoped CSS, and unmount/remount; Vue Rust-file watch also covers failure recovery, style edits and new modules; other framework/watch combinations remain unverified. |

## Unreleased 0.2 SSR additions

Current source keeps Vue Store creation in the browser and preserves React
client boundaries. Adapter tests cover server rendering and hydration; the
Nuxt packed consumer covers WASM loading, props/events, independent Stores and
route cleanup. The server renders host containers, not Rust component content.
Next.js remains unverified. See the [SSR scope](./ssr-roadmap.md) for the API boundaries.

## Not verified / not supported yet

- WebKit/Safari and mobile browsers have no current compatibility claim. Firefox evidence is limited to the named Vue source
  component path above.
- Solid on Rspack/Webpack, or browsers other than the named Chromium
  fixture has no current compatibility claim.
- Svelte 3/4, SvelteKit, Svelte SSR/hydration, and Svelte
  through Rspack/Webpack have no current compatibility claim. The Svelte row
  above is limited to its named Vite 7/8 + Chromium fixtures.
- No precompiled component product is currently published; the Vue fixture is
  build-contract evidence only.
- Webpack 4, Rspack versions below 2.1.10, Rollup, Turbopack, and other unlisted
  bundlers have no compatibility claim. The Turbopack API evidence and remaining integration questions are
  recorded in [Turbopack research](turbopack-research.md); exact Rspack evidence
  is limited to the versions named in the row above.
- Vite+ adds a CLI, runtime/package-manager management, and a Vite core alias;
  it uses the normal `vooya()` Vite plugin. The pinned dev/build fixtures do not
  cover every bundled Vite+ tool or other Vite+ versions. See the
  [Vite+ setup](../guide/other-integrations.md#vite) for alias and override configuration.
- The old `.voo` path was an exploratory intermediate. Remaining legacy fixtures
  are repository regression evidence only and are not a supported authoring or
  compatibility claim.
- Prerelease ABI revisions may be breaking. Use the `beta` channel and retain
  the lockfile; package versions are independent and internal dependencies are exact.
- Vapor applications must use Vue's Vapor runtime, `createVaporApp`, and
  `vaporInteropPlugin`; Vooya does not replace that host-framework setup.

## Updating this matrix

Add an entry only with an automated command that runs against a fresh browser
or packed consumer. State the exact framework and browser project; do not turn
a passing Chromium fixture into a general browser-support statement.
