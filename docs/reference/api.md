# API Reference

This page lists the public consumption paths verified from the package exports.
The alpha ABI may change between prereleases. Internal `@vooya/build-core`
helpers are implementation details unless a package page explicitly exports
them.

Generated `.rs` modules currently pass a framework-neutral Component or Store
bridge into the selected adapter. This is the implementation boundary that
keeps framework branches out of generation; it is not a stable author-facing
IR. The supported application APIs are the generated component, `useName()`,
and `createNameStore()` exports described below.

See the [tooling reference](./tooling.md), [compatibility matrix](../project/compatibility.md),
and [ABI v1 RFC](../rfcs/0007-rust-file-authoring-and-abi-v1.md) for the wider
boundary.

## `@vooya/vite`

### `vooya(options?)`

| Export / parameter | Type / values | Default | When to use | Current boundary / minimal example |
| --- | --- | --- | --- | --- |
| `vooya()` | `Plugin` | — | Add Vooya to a Vite config | Vite `>=7 <9`; `plugins: [vue(), vooya()]` |
| `framework` | `"vue" \| "react" \| "solid" \| "svelte"` | `"vue"` | Select the host adapter | Vue 3 and React 19 are supported; Solid 1.9 and Svelte 5 are experimental on Vite 7 |
| `rust.dependencies` | `Record<string, string \| Dependency>` | Nearest `Cargo.toml`, then `{}` | Reuse or override Cargo registry, Git, or path crates | Browser-compatible Rust only; explicit plugin entries win by package name |
| `rust.webSysFeatures` | `string[]` | Nearest `Cargo.toml`, then `[]` | Enable browser APIs from `web-sys` | Explicit plugin features win; generated runtime features remain enabled |
| `toolchain.cargoPath` | `string` | PATH discovery | Select a specific Cargo | Explicit selection is authoritative; Cargo's rustc, target, and CLI must agree |
| `workspace.root` | `string` | `.vooya/` | Put generated state elsewhere | Also update TypeScript `rootDirs`; generated state remains disposable |

```ts
import { vooya } from "@vooya/vite";

vooya({ framework: "vue", toolchain: { cargoPath: "/opt/rust/bin/cargo" } });
```

## CLI: `vooya doctor` and `vooya clean`

| Command / option | Type / values | Default | When to use | Current boundary / minimal example |
| --- | --- | --- | --- | --- |
| `vooya doctor` | CLI command | — | Diagnose Cargo, rustc, target, wasm-bindgen, linker, and generated types | Diagnostic only; it does not install a toolchain |
| `--cargo-path` | filesystem path | PATH discovery | Pair with an explicit toolchain | Only valid for `doctor`; `vooya doctor --cargo-path /opt/rust/bin/cargo` |
| `--workspace-root` | filesystem path | `.vooya/` | Inspect a workspace override | Valid for `doctor` and `clean` |
| `vooya clean` | CLI command | — | Remove generated Vooya state | It removes the selected generated workspace, not source files |

## `@vooya/vue` adapter

### Generated `useName(options?)`

Rust-file Store imports generate `useName()` alongside `createNameStore()`. For
example, `Cart` generates `useCart()` with `{ state, ...typedActions }`. This is
the primary Store API for Vue application code; `state` is a readonly reactive
`Ref` and is automatically unwrapped in templates.

| Export / parameter | Type / values | Default | When to use | Current boundary / minimal example |
| --- | --- | --- | --- | --- |
| Generated hook | `useName(options?)` | — | Consume a `#[voo::store]` `.rs` file | `const { state, add } = useCart()` |
| `options` | `VooyaStoreOptions` | `{}` | Observe creation failures and configure adapter behavior | Generated hook owns and disposes its instance |

### `useVooyaStore(source, options?)` (advanced)

| Export / parameter | Type / values | Default | When to use | Current boundary / minimal example |
| --- | --- | --- | --- | --- |
| `useVooyaStore` | `(store \| PromiseLike<store>, options?)` | — | Custom integration or shared-instance ownership | Vue `>=3.5.2 <4`; not the primary generated hook |
| `source` | `VooyaStore \| PromiseLike<VooyaStore>` | required | Pass an instance or generated async store factory | The late instance is disposed if the component unmounts first |
| `disposeOnUnmount` | `boolean` | `false` | Give this component ownership of disposal | Use `true` for an instance-scoped store; shared stores need an explicit owner |
| `onError` | `(cause: unknown) => void` | — | Receive async creation failures | It does not retry or hide action errors |

`useVooyaStore` is an adapter-level API, not the primary cross-framework Store
entry point and not Vapor-only. React applications use the generated hook below;
Vapor applications additionally require
Vue's own `createVaporApp` and `vaporInteropPlugin` setup.

The return value is `{ snapshot, dispatch, unsubscribe }`. `dispatch(name,
...args)` calls a declared store action; async actions are outside ABI v1.

## `@vooya/react`

Generated `.rs` imports expose a component or a typed hook such as `useCart()`.
Vue, React, Solid, and Svelte receive the same generated names and fields: `state` plus
typed actions. React's `state` is the current snapshot value.

| Export / parameter | Type / values | Default | When to use | Current boundary / minimal example |
| --- | --- | --- | --- | --- |
| Generated component | React component props | — | Import a `#[voo::component]` `.rs` file | React `>=19`; `import Counter from "./Counter.rs"` |
| Generated hook | `useName(options?)` | — | Consume a `#[voo::store]` `.rs` file | Uses `useSyncExternalStore`; one store instance per hook lifetime |
| `useVooyaStore` | `(factory, props, options?)` | — | Build a custom adapter or shared-instance integration | Advanced API; factory may return a store or Promise |
| `onError` / `onNotify` | callbacks | — | Observe creation failures or notifications | Adapter callbacks only; no global event bus |

## `@vooya/solid`

Solid uses the same generated component and `useName()` entry names. The
framework-neutral bridge is wrapped with Solid owners, signals, and cleanup;
`state` is an accessor because the WASM store initializes asynchronously.

| Export / parameter | Type / values | Default | When to use | Current boundary / minimal example |
| --- | --- | --- | --- | --- |
| Generated component | Solid component props | — | Import a `#[voo::component]` `.rs` file | Solid `>=1.9 <2`; callback props use `onEventName` |
| Generated primitive | `useName(options?)` | — | Consume a `#[voo::store]` `.rs` file | `const { state, add } = useCart(); state()?.count` |
| `useVooyaStore` | `(factory, props, options?)` | — | Build a custom adapter or shared-instance integration | Advanced API; factory may return a store or Promise |
| `onError` | `(cause: unknown) => void` | — | Observe an asynchronous factory failure | Cleanup is tied to the current Solid owner |
| `onNotify` | callback field forwarded to a custom factory | — | Advanced factory-specific instrumentation | Generated Solid Stores publish state through subscription; they do not expose a separate notification bus |

The shared generated names intentionally do not force one reactive container
across frameworks: Vue returns a `Ref`, React returns a snapshot value, and
Solid returns an `Accessor`. The lifecycle, action, error, and ownership
contract remains aligned. `undefined` means that the asynchronous WASM Store is
not ready yet in these adapters.

## `@vooya/svelte`

Svelte uses the same generated component and `useName()` entry names. The
framework-neutral bridge is wrapped with Svelte component lifecycle and a
`Readable<T | undefined>` Store; templates consume it through `$state`.

| Export / parameter | Type / values | Default | When to use | Current boundary / minimal example |
| --- | --- | --- | --- | --- |
| Generated component | Svelte component props | — | Import a `#[voo::component]` `.rs` file | Svelte `>=5 <6`; callback props use `onEventName` |
| Generated Store entry | `useName(options?)` | — | Consume a `#[voo::store]` `.rs` file | `const { state, add } = useCart()`; template reads `$state?.count` |
| `useVooyaStore` | `(factory, props, options?)` | — | Build a custom adapter or shared-instance integration | Advanced API; factory may return a Store or Promise |
| `onError` | `(cause: unknown) => void` | — | Observe an asynchronous factory failure | Component and generated Store cleanup are tied to Svelte destruction |
| `onNotify` | callback field forwarded to a custom factory | — | Advanced factory-specific instrumentation | Generated Svelte Stores publish through `Readable`; no separate notification bus is documented |

The current evidence is Svelte 5 + Vite 7 + Chromium. It covers Component
mount and callback, Store action, Component prop update, generated declarations,
and one cleanup call each for the Component handle and generated Store. It does
not cover Svelte 3/4, SvelteKit, SSR, hydration, Vite 8, Rspack, or Webpack.

## `@vooya/rspack`

The alpha.10 Rspack and Webpack implementations still expose a legacy `.voo`
loader rule for their experimental fixtures. `.voo` is retired as a new
authoring format and is scheduled for removal; use Rust-file authoring through
the primary Vite path until those adapters are migrated.

| Export / parameter | Type / values | Default | When to use | Current boundary / minimal example |
| --- | --- | --- | --- | --- |
| `vooyaRsbuild(options?)` | `VooyaRsbuildPlugin` | — | Add Vooya to Rsbuild | Experimental; Rspack `>=2.1.10`, Rsbuild `>=2.1.13` |
| `vooyaRspack(options?)` | `VooyaRspackPlugin` | — | Configure Rspack directly | Experimental; add `plugins: [vooya]` and `vooya.rule()` |
| `framework` | `"vue" \| "react"` | `"vue"` | Select the host adapter | Current fixtures use the transitional `.voo` path; Rust-file parity is not claimed |
| `rust`, `workspaceRoot` | Rust options, filesystem path | `{}`, `.vooya/` | Share Rust deps or move generated state | Experimental adapter options; see the package README |
| `rule()` | `{ test: /\.voo$/, loader, options }` | — | Add the source loader to direct Rspack | Public rule is for the current transitional `.voo` fixture path |

## `@vooya/webpack`

| Export / parameter | Type / values | Default | When to use | Current boundary / minimal example |
| --- | --- | --- | --- | --- |
| `vooyaWebpack(options?)` | `VooyaWebpackPlugin` | — | Add Vooya to Webpack 5 | Experimental; Webpack `>=5` |
| `framework` | `"vue" \| "react"` | `"vue"` | Select the host adapter | Current fixtures use the transitional `.voo` path; Rust-file parity is not claimed |
| `rust`, `workspaceRoot` | Rust options, filesystem path | `{}`, `.vooya/` | Share Rust deps or move generated state | Experimental adapter options; see the package README |
| `rule()` | `{ test: /\.voo$/, use: [{ loader, options }] }` | — | Add the source loader to Webpack | Requires normal framework, CSS, and async WASM config |

No Web Components, precompiled artifact consumer, SSR, hydration, or general
renderer API is currently published as part of these packages.
