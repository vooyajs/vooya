# Scatter-plot demo

`examples/scatter-plot` is the flagship integration example for a Rust-owned
Canvas surface inside a Vue application. Vue owns the page and the point-count
input. The Rust component owns deterministic point generation, Canvas drawing,
and its zoom controls within its island.

Run it from a repository checkout:

```sh
npm run dev:scatter
```

For a repeatable production build and browser check, run:

```sh
npm run build:scatter
npm run test:e2e:scatter
```

The browser check starts a fresh local Vite server and verifies a 150,000-point
initial render, zoom and reset controls, a point-count update to 50,000, and no
page or console errors during that flow. It runs against the example source; it
is not a cross-browser compatibility guarantee or a performance comparison.

This example demonstrates the component boundary and interaction path. It does
not claim that Rust, WASM, or Vooya is faster than an equivalent JavaScript
implementation. See the [data-grid benchmark records](../benchmarks/data-grid.md)
for the separate, measured performance work.
