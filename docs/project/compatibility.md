# Compatibility matrix

This matrix records browser tests that run in this repository. It is not a
cross-browser certification, a production-support promise, or a claim about
SSR and hydration. Each entry is evidence for the named test path only.

## Framework and host-tool minimums

| Layer | Minimum version | Status | Evidence and boundary |
| --- | --- | --- | --- |
| Node.js | `^20.19.0 \|\| >=22.12.0` | Supported | Source quickstarts run on Ubuntu + Node 20, macOS + Node 22, Windows + Node 22; the full release gate runs on Ubuntu + Node 22 |
| Vue | `>=3.5.2 <4` | Supported | Strict adapter declaration checks pass from 3.5.2 through 3.5.41; Vue 3.6 is a compatibility target and will be verified in its own fixture; 3.5.0 and 3.5.1 are outside the supported type boundary |
| React | `>=19` | Supported | Browser fixtures cover 19.0.0 and 19.2.0; React 18 is below the supported minimum |
| React 19 Rust-file authoring | Vite 7 | Experimental | Production build and browser interaction cover an instance-scoped store, `useSyncExternalStore`, atomic component prop updates, and StrictMode cleanup |
| Vue Vapor | Vue 3.6 experimental | Verified, experimental | Vite 8 + Vue 3.6.0-beta.17 mounts a Rust-file component when the app uses Vue's `vaporInteropPlugin`; Vapor remains an upstream Vue opt-in |

## Verified in local Playwright projects

| Consumer path | Verified behavior | Evidence |
| --- | --- | --- |
| Vue 3 Rust-file component/store | Vite 7 production build, scoped CSS, store action and snapshot-driven component update | `npm run test:rust-vue`; packed source quickstarts run on the OS/Node jobs in `.github/workflows/verify.yml` |
| React 19 Rust-file component/store | Vite 7 production build, StrictMode mount, store action and snapshot-driven component update | `npm run test:rust-react` |
| Rust-file Vite development path | Rust source edit, failed rebuild recovery, subsequent successful rebuild, and full reload | `npm run test:rust-hmr` |
| Rust `rsx!` DOM runtime | Signal text/attribute updates, owned events, conditional `if`/`else`, keyed `for` reorder and DOM identity, disposal | `npm run test:rsx` |
| Vue TaskList | Reactive state, keyed rows, filtering, validation error state | `npm run test:e2e` (tasks target) |
| Vue DataGrid | Filter, sort, virtual scroll, local measurement control | `npm run test:e2e` (benchmark target) |
| Vue Canvas scatter | 150,000-point initial island, point-count update, zoom/reset, no page or console error | `npm run test:e2e:scatter` |
| Vue precompiled build fixture | Generated WASM in a clean Vite consumer without Rust tooling; mount and prop update | `npm run test:precompiled-vue` |

## Verified bundler/toolchain matrix

These entries run against packed Vooya packages in a fresh temporary consumer.
The evidence and boundary columns state the exact checks exercised by each
toolchain; a production smoke does not imply development-server or HMR support.

| Toolchain | Minimum version | Evidence | Boundary |
| --- | --- | --- | --- |
| Vite | `>=7 <9` | `npm run test:vite8` | Vite 8.2.1 is the primary packed compatibility target; Vite 7 remains a required regression path in the repository fixtures and release gate |
| Vite 8 + Vue Vapor | Vite `8.2.1`; Vue `3.6.0-beta.17` | `npm run test:vite8-vapor` | Rust-file component mounts in a Vapor app with `vaporInteropPlugin`; experimental evidence only |
| Vite+ | `>=0.2.9` | `npm run test:vite-plus` | Production output and browser WASM loading at 0.2.9 using Vite+'s Vite core alias; the alias currently requires npm legacy peer resolution, and development rebuild and HMR behavior are not claimed |
| Rspack / Rsbuild | Rspack `>=2.1.10`; Rsbuild `>=2.1.13` | `npm run test:rspack` | Experimental packed Vue/React/Rslib/native-Rspack fixtures with WASM, scoped CSS, lifecycle checks, mapped diagnostics, and rebuild recovery. The current fixture is transitional and does not yet establish parity with the Rust-file Vite path. |
| Webpack | `>=5` | `npm run test:webpack` | Experimental packed Vue/React production and watch fixtures with emitted WASM, scoped CSS, lifecycle checks, mapped diagnostics, and recovery. The current fixture is transitional and does not yet establish parity with the Rust-file Vite path. |

## Not verified / not supported yet

- WebKit/Safari, mobile browsers, SSR, and hydration have no current
  compatibility claim. Firefox evidence is limited to the named Vue source
  component path above.
- No precompiled component product is currently published; the Vue fixture is
  build-contract evidence only.
- Webpack 4, Rspack versions below 2.1.10, Rollup, Turbopack, and other unlisted
  bundlers have no compatibility claim. Exact Rspack evidence is limited to the
  versions named in the row above.
- Vite+ adds a CLI, runtime/package-manager management, and a Vite core alias;
  it does not remove the need for the normal `vooya()` Vite plugin. Its smoke
  path is intentionally tracked separately from the Vite support promise.
- The old `.voo` path was an exploratory intermediate. Remaining legacy fixtures
  are repository regression evidence only and are not a supported authoring or
  compatibility claim.
- Alpha ABI revisions may be breaking; use one exact coordinated `@vooya`
  package version.
- Vapor applications must use Vue's Vapor runtime, `createVaporApp`, and
  `vaporInteropPlugin`; Vooya does not replace that host-framework setup.

## Updating this matrix

Add an entry only with an automated command that runs against a fresh browser
or packed consumer. State the exact framework and browser project; do not turn
a passing Chromium fixture into a general browser-support statement.
