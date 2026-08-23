# `@vooya/vue`

Vue `>=3.5.2` lifecycle adapter for Rust components compiled by Vooya.

```sh
npm install @vooya/vue@alpha
npm install --save-dev @vooya/vite@alpha
```

Configure `vooya()` after `@vitejs/plugin-vue`, then import a Rust-file `.rs`
component as a normal Vue component. Generated declarations expose its props
and events to TypeScript. Rust-file stores expose a generated hook such as
`useCart()` with the same public shape as React. The lower-level
`useVooyaStore` composable remains available for custom integrations; generated
instances are disposed safely on unmount.

This package is an alpha and must use the same version as the other `@vooya`
packages.
