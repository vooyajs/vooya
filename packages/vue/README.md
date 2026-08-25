# `@vooya/vue`

Vue `>=3.5.2 <4` lifecycle adapter for Rust components compiled by Vooya.

```sh
npm install @vooya/vue@alpha
npm install --save-dev @vooya/vite@alpha
```

Configure `vooya()` after `@vitejs/plugin-vue`, then import a Rust-file `.rs`
component as a normal Vue component. Generated declarations expose its props
and events to TypeScript. Rust-file stores expose a generated hook such as
`useCart()` with the same generated names and fields as React, Solid, and Svelte. Vue
keeps `state` as a readonly `Ref`; it is not the same reactive container as a
React snapshot, Solid `Accessor`, or Svelte `Readable`. The lower-level
`useVooyaStore` composable remains available for custom integrations; generated
instances are disposed safely on unmount.

This package is an alpha and must use the same version as the other `@vooya`
packages.
