# `@vooya/react`

React `>=19` lifecycle adapter for Rust components compiled by Vooya.

```sh
npm install @vooya/react@alpha
npm install --save-dev @vooya/vite@alpha
```

Configure `vooya({ framework: "react" })` after `@vitejs/plugin-react`, then
import a `.voo` file as a normal React component. Generated declarations expose
its props and event callbacks to TypeScript.

Rust-file authoring uses ordinary `.rs` files. A `#[voo::component]` import is
exposed as a React component, while a `#[voo::store]` import exposes a generated
hook such as `useCart()`. Store snapshots use `useSyncExternalStore`; the hook
owns one store instance until unmount and disposes asynchronous late arrivals.
In ABI v1, stores are created from Rust's `Default` implementation, so the
optional `useCart(options)` argument is adapter options rather than constructor
props. Use explicit Rust actions for state changes after creation.

The generated `.d.rs.ts` declaration includes the store interface, the
`createCartStore` factory/default export, and the typed `useCart` hook. Generated
Rust snapshots preserve JavaScript identity until their value changes, which is
required by `useSyncExternalStore`.

## Prop defaults

A `.voo` prop declared with a default (for example `name: String = "world"`) is
optional in the generated React props, and the default is passed to the WASM
`mount` when the consumer omits the prop. Explicit values — including `false`,
`0`, and `""` — are passed through untouched.

The same resolution applies to later prop updates: if a consumer removes a
previously set prop, the declared default is passed again. This matches the
`@vooya/vue` adapter's semantics.

This package is an alpha and must use the same version as the other `@vooya`
packages.
