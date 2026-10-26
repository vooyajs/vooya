# API Reference

Unless a section says otherwise, this reference describes the [published 0.1 beta packages](../project/status.md). Managed toolchain modes and SSR-safe Store factories belong to the [opt-in 0.2 alpha](../project/next-release.md); installing `@beta` does not enable them. Octane is a separate private workspace experiment, excluded from that release batch.

This page lists the public consumption paths verified from the package exports.
The beta ABI may change between prereleases. Internal `@vooya/build-core`
helpers are implementation details unless a package page explicitly exports
them.

Current-source generated `.rs` modules pass a framework-neutral Component or Store
bridge into the selected adapter. This is the implementation boundary that
keeps framework branches out of generation; it is not a stable author-facing
IR. The supported application APIs are the generated component, `useName()`,
and `createNameStore()` exports described below. The source implementation
description does not add an application API to the published beta.

See the [tooling reference](./tooling.md), [compatibility matrix](../project/compatibility.md),
and [ABI v1 RFC](../rfcs/0007-rust-file-authoring-and-abi-v1.md) for the wider
boundary.

## Rust component update modes

`#[voo::component]` keeps the compatibility behavior of replacing its owned
root after a framework prop change. Stateful browser surfaces can opt into
`#[voo::component(update = "path::to::handler")]`; the handler receives
`(&voo::ViewElement, Props)` and updates the mounted root in place. The handler
is synchronous, receives the complete next props object, and shares the
original root's disposal scope. See [RFC 0010](../rfcs/0010-in-place-component-updates.md).

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
| `--json` | flag | off | Emit a versioned JSON diagnostic report | Only valid for `doctor`; available since `@vooya/vite@0.1.0-beta.1`, not beta.0 |
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
| Generated hook | `useName(options?)` | — | Consume a `#[voo::store]` `.rs` file | `const { state, add } = useCart()`; current generated actions return `void` |
| `options` | `VooyaStoreOptions` | `{}` | Observe creation failures and configure adapter behavior | Generated hook owns and disposes its instance |

### `useVooyaStore(source, options?)` (advanced)

The following type compatibility is available since `@vooya/vue@0.1.0-beta.1`
and `0.1.0-beta.2` of `@vooya/react`, `@vooya/solid`, and `@vooya/svelte`.
Earlier releases still require an index signature and do not include this fix.

The Store contract requires `getSnapshot`, `subscribe`, and `dispose`; generated
Store interfaces do not need a string index signature. Vue accepts the generated
factory's Promise directly. React, Solid, and Svelte accept the factory plus props
and infer the snapshot and declared actions from its Store type. Prefer generated
`use<Name>` hooks for ordinary application code.

| Export / parameter | Type / values | Default | When to use | Current boundary / minimal example |
| --- | --- | --- | --- | --- |
| `useVooyaStore` | `(store \| PromiseLike<store>, options?)` | — | Custom integration or shared-instance ownership | Vue `>=3.5.2 <4`; not the primary generated hook |
| `source` | `VooyaStore \| PromiseLike<VooyaStore>` | required | Pass an instance or generated async store factory | The late instance is disposed if the component unmounts first |
| `disposeOnUnmount` | `boolean` | `false` | Give this component ownership of disposal | Use `true` for an instance-scoped store; shared stores need an explicit owner |
| `onError` | `(cause: unknown) => void` | — | Receive creation, attachment, and notification snapshot failures | It does not retry or hide action errors |

`useVooyaStore` is an adapter-level API, not the primary cross-framework Store
entry point and not Vapor-only. This section shows the Vue signature; the other
adapters also export low-level hooks with the signatures listed in their sections.
Prefer the generated hook for ordinary application code. Vapor applications additionally require
Vue's own `createVaporApp` and `vaporInteropPlugin` setup.

The return value is `{ snapshot, dispatch, unsubscribe }`. `dispatch(name,
...args)` calls a declared store action; async actions are outside ABI v1.

## `@vooya/react`

Generated `.rs` imports expose a component or a typed hook such as `useCart()`.
Vue, React, Solid, and Svelte receive the same generated names and fields: `state` plus
typed action arguments. React's `state` is the current snapshot value. Generated
Store actions currently return `void`, even if their Rust implementation returns
a successful value; typed action results are tracked in [Issue #152](https://github.com/vooyajs/vooya/issues/152).

| Export / parameter | Type / values | Default | When to use | Current boundary / minimal example |
| --- | --- | --- | --- | --- |
| Generated component | React component props | — | Import a `#[voo::component]` `.rs` file | React `>=19`; `import Counter from "./Counter.rs"` |
| Generated hook | `useName(options?)` | — | Consume a `#[voo::store]` `.rs` file | Uses `useSyncExternalStore`; one store instance per hook lifetime |
| `useVooyaStore` | `(factory, props, options?)` | — | Build a custom adapter or shared-instance integration | Advanced API; factory may return a store or Promise |
| `onError` | callback | — | Observe creation and subscription failures | It does not receive Rust domain events |
| `onNotify` | `(name: string, payload: unknown) => void` | — | Instrument a custom factory | Forwarded to custom factories, also in Solid and Svelte; not a typed generated Store event channel |

`@vooya/react@0.2.0-alpha.1` reports React Store subscription failures through
the latest active `onError` callback and disposes the failed instance once.
Cleanup failures during attachment do not replace the original initialization
error. Late initialization after unmount disposes the instance without
subscribing; late errors and factory callbacks are suppressed. This fix is
part of the [alpha refresh](../project/next-release.md); older releases retain their behavior.

## `@vooya/solid`

Solid uses the same generated component and `useName()` entry names. The
framework-neutral bridge is wrapped with Solid owners, signals, and cleanup;
`state` is an accessor because the WASM store initializes asynchronously.

| Export / parameter | Type / values | Default | When to use | Current boundary / minimal example |
| --- | --- | --- | --- | --- |
| Generated component | Solid component props | — | Import a `#[voo::component]` `.rs` file | Solid `>=1.9 <2`; callback props use `onEventName` |
| Generated primitive | `useName(options?)` | — | Consume a `#[voo::store]` `.rs` file | `const { state, add } = useCart(); state()?.count` |
| `useVooyaStore` | `(factory, props, options?)` | — | Build a custom adapter or shared-instance integration | Advanced API; factory may return a store or Promise |
| `onError` | `(cause: unknown) => void` | — | Observe Store creation, attachment, and notification snapshot failures | Cleanup is tied to the current Solid owner |
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
| `onError` | `(cause: unknown) => void` | — | Observe Store creation, attachment, and notification snapshot failures | Component and generated Store cleanup are tied to Svelte destruction |
| `onNotify` | callback field forwarded to a custom factory | — | Advanced factory-specific instrumentation | Generated Svelte Stores publish through `Readable`; no separate notification bus is documented |

Generated Store domain notifications are not yet available in any first-party
adapter. The planned ABI must associate a Store with an explicit event schema,
generate typed host callbacks, and ensure notification unsubscribe/dispose is
independent from snapshot subscriptions; see [Issue #153](https://github.com/vooyajs/vooya/issues/153).

The current evidence is Svelte 5 + Vite 7 + Chromium. It covers Component
mount and callback, Store action, Component prop update, generated declarations,
and one cleanup call each for the Component handle and generated Store. It does
not cover Svelte 3/4, SvelteKit, SSR, hydration, Rspack, or Webpack. Separate
Vite 8 packed-source coverage is recorded in the [compatibility matrix](../project/compatibility.md).

Vue, Solid, and Svelte report Store creation,
initial snapshot, and subscription failures through `onError` and clear failed
bindings. Owned instances are released once; Vue custom sources retain their
`disposeOnUnmount` policy. A notification snapshot failure preserves the last
good state and a later notification may recover. Cleanup attempts disposal even
if unsubscribe throws. Cleanup failures during attachment preserve the original
error; normal unmount cleanup errors use the framework lifecycle error handling.
Late resolution disposes the instance without attaching it. These fixes are published in Vue `0.2.0-alpha.1` and
Solid/Svelte `0.2.0-alpha.0`; see the [alpha graph](../project/next-release.md).

## `@vooya/rspack`

Rust-file integration first shipped in the opt-in `0.2.0-alpha.0` package graph.
This reference describes the current development API. Its loader handles `.rs`
only; older published packages are unchanged by the [format retirement](../project/retired-authoring.md).

| Export / parameter | Type / values | Default | Current boundary |
| --- | --- | --- | --- |
| `vooyaRsbuild(options?)` | `VooyaRsbuildPlugin` | — | Rspack `>=2.1.10`, Rsbuild `>=2.1.13` |
| `vooyaRspack(options?)` | `VooyaRspackPlugin` | — | Add `plugins: [vooya]` and `vooya.rule()` |
| `framework` | `"vue" \| "react" \| "solid" \| "svelte"` | `"vue"` | Vue/React have production browser coverage; Solid/Svelte bundler combinations remain unverified |
| `rust`, `workspaceRoot`, `toolchain` | Rust options, workspace path, tool selection | `{}`, `.vooya/`, auto | Share dependencies and select system or managed tools |
| `rule()` | `{ test: /\.rs$/, loader, options }` | — | Import schema-owning Rust Component/Store files |

## `@vooya/webpack`

| Export / parameter | Type / values | Default | Current boundary |
| --- | --- | --- | --- |
| `vooyaWebpack(options?)` | `VooyaWebpackPlugin` | — | Webpack `>=5`; configure normal framework, CSS and async WASM rules |
| `framework` | `"vue" \| "react" \| "solid" \| "svelte"` | `"vue"` | Vue/React have production browser coverage; other combinations remain unverified |
| `rust`, `workspaceRoot`, `toolchain` | Rust options, workspace path, tool selection | `{}`, `.vooya/`, auto | Shared Rust build options |
| `rule()` | `{ test: /\.rs$/, use: [{ loader, options }] }` | — | Rust source loader; Webpack watch uses a generated runtime marker |

Vue Rust watch covers failure recovery, linked CSS edits, and new modules.
React production coverage does not establish React development-server parity.
These packages do not establish Next.js, SSR, hydration, state-preserving HMR,
or a published precompiled component product.
