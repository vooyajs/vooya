# API Reference

This page lists the public consumption paths verified from the package exports.
The alpha ABI may change between prereleases. Internal `@vooya/build-core`
helpers are implementation details unless a package page explicitly exports
them.

See the [tooling reference](./tooling.md), [compatibility matrix](../project/compatibility.md),
and [ABI v1 RFC](../rfcs/0007-rust-file-authoring-and-abi-v1.md) for the wider
boundary.

## `@vooya/vite`

### `vooya(options?)`

| Export / parameter | Type / values | Default | When to use | Current boundary / minimal example |
| --- | --- | --- | --- | --- |
| `vooya()` | `Plugin` | — | Add Vooya to a Vite config | Vite `>=7 <9`; `plugins: [vue(), vooya()]` |
| `framework` | `"vue" \| "react"` | `"vue"` | Select the host adapter | Vue 3 or React 19; `vooya({ framework: "react" })` |
| `rust.dependencies` | `Record<string, string \| Dependency>` | `{}` | Reuse Cargo registry, Git, or path crates | Browser-compatible Rust only; `rust: { dependencies: { serde: "1" } }` |
| `rust.webSysFeatures` | `string[]` | `[]` | Enable browser APIs from `web-sys` | Add features instead of overriding generated `web-sys` |
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

## `@vooya/vue`

### `useVooyaStore(source, options?)`

| Export / parameter | Type / values | Default | When to use | Current boundary / minimal example |
| --- | --- | --- | --- | --- |
| `useVooyaStore` | `(store \| PromiseLike<store>, options?)` | — | Mirror a Rust store snapshot in Vue | Vue `>=3.5.2`; `const { snapshot, dispatch } = useVooyaStore(store)` |
| `source` | `VooyaStore \| PromiseLike<VooyaStore>` | required | Pass an instance or generated async store factory | The late instance is disposed if the component unmounts first |
| `disposeOnUnmount` | `boolean` | `false` | Give this component ownership of disposal | Use `true` for an instance-scoped store; shared stores need an explicit owner |
| `onError` | `(cause: unknown) => void` | — | Receive async creation failures | It does not retry or hide action errors |

The return value is `{ snapshot, dispatch, unsubscribe }`. `dispatch(name,
...args)` calls a declared store action; async actions are outside ABI v1.

## `@vooya/react`

Generated `.rs` imports expose a component or a typed hook such as `useCart()`.
The package also exports the lower-level `defineVooyaComponent` and
`useVooyaStore` helpers for generated integrations.

| Export / parameter | Type / values | Default | When to use | Current boundary / minimal example |
| --- | --- | --- | --- | --- |
| Generated component | React component props | — | Import a `#[voo::component]` `.rs` file | React `>=19`; `import Counter from "./Counter.rs"` |
| Generated hook | `useName(props, options?)` | — | Consume a `#[voo::store]` `.rs` file | Uses `useSyncExternalStore`; one store instance per hook lifetime |
| `useVooyaStore` | `(factory, props, options?)` | — | Build a custom store adapter | Factory may return a store or Promise; late stores are disposed |
| `onError` / `onNotify` | callbacks | — | Observe creation failures or notifications | Adapter callbacks only; no global event bus |

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
