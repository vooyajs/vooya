# `@vooya/vue`

Vue `>=3.5.2 <4` lifecycle adapter for Rust components compiled by Vooya.

```sh
npm install @vooya/vue@beta
npm install --save-dev @vooya/vite@beta
```

Configure `vooya()` after `@vitejs/plugin-vue`, then import a Rust-file `.rs`
component as a normal Vue component. Generated declarations expose its props
and events to TypeScript. Rust-file stores expose a generated hook such as
`useCart()` with the same generated names and fields as React, Solid, and Svelte. Vue
keeps `state` as a readonly `Ref`; it is not the same reactive container as a
React snapshot, Solid `Accessor`, or Svelte `Readable`. The lower-level
`useVooyaStore` composable remains available for custom integrations; generated
instances are disposed safely on unmount.

This package is published on the `beta` channel. Package versions are
independent; install the adapter and Vite integration from the same channel
and retain your lockfile.

See the [framework capability matrix](https://github.com/vooyajs/vooya/blob/main/docs/project/compatibility.md#beta-framework-capabilities)
for the beta support level and tested consumer paths.
