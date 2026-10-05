---
"@vooya/vue": minor
"@vooya/react": minor
"@vooya/build-core": minor
---

Start the 0.2 SSR integration foundation. Vue generated Store factories now load
only after client mount, and the advanced Store composable accepts a lazy factory.
React's package entry preserves its client-module directive. Server rendering
and host hydration have adapter-level regression coverage. The named Nuxt 4.5.2
fixture (Vite 8.3.1, Vue 3.5.43) also verifies production SSR hosts and
browser-mounted WASM islands, including components, Stores and cleanup.
Next.js, Edge runtimes and server rendering of Rust DOM content remain outside
this release's verified scope.

Extract Rust build mechanics behind the existing buildApplication facade and an
internal provider interface, preserving the public build result, locking, staged
artifacts, diagnostics, and default Rust configuration. The initial interface
still models Rust's single-WASM artifact; it is not a public multi-language API.

Route synchronous React Store factory failures through onError, matching asynchronous initialization failures.
