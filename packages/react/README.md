# `@vooya/react`

React `>=19` lifecycle adapter for Rust components compiled by Vooya.

```sh
npm install @vooya/react@beta
npm install --save-dev @vooya/vite@beta
```

Configure `vooya({ framework: "react" })` after `@vitejs/plugin-react`, then
import a Rust-file `.rs` component as a normal React component. Generated
declarations expose its props and event callbacks to TypeScript. The retired
`.voo` path is not a supported authoring format.

Rust-file authoring uses ordinary `.rs` files. A `#[voo::component]` import is
exposed as a React component, while a `#[voo::store]` import exposes a generated
hook such as `useCart()`. Store snapshots use `useSyncExternalStore`; the hook
owns one store instance until unmount and disposes asynchronous late arrivals.
Generated Store names and fields align with Vue, Solid, and Svelte, while React
keeps `state` as the current snapshot value instead of imitating a Vue `Ref`,
Solid `Accessor`, or Svelte `Readable`.
In ABI v1, stores are created from Rust's `Default` implementation, so the
optional `useCart(options)` argument is adapter options rather than constructor
props. Use explicit Rust actions for state changes after creation.

The generated `.d.rs.ts` declaration includes the store interface, the
`createCartStore` factory/default export, and the typed `useCart` hook. Generated
Rust snapshots preserve JavaScript identity until their value changes, which is
required by `useSyncExternalStore`.

## Legacy `.voo` prop defaults

A `.voo` prop declared with a default (for example `name: String = "world"`) is
optional in the generated React props, and the default is passed to the WASM
`mount` when the consumer omits the prop. Explicit values — including `false`,
`0`, and `""` — are passed through untouched.

The same resolution applies to later prop updates: if a consumer removes a
previously set prop, the declared default is passed again. This matches the
`@vooya/vue` adapter's semantics.

This package is published on the `beta` channel. Package versions are
independent; install the adapter and Vite integration from the same channel
and retain your lockfile.

See the [framework capability matrix](https://github.com/vooyajs/vooya/blob/main/docs/project/compatibility.md#beta-framework-capabilities)
for the beta support level and tested consumer paths.
