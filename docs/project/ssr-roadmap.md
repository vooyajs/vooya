# SSR and the 0.2 provider boundary

SSR integration and Rust provider extraction are the next **0.2.0 feature
workstream**. They are not part of the published 0.1.0-beta.0 support promise.
Bug fixes remain patch changes; new SSR behavior and provider architecture use
minor changesets. Do not edit package versions or publish 0.2 before acceptance.

## First target: SSR pages with client-mounted WASM islands

Next.js is the React host; Nuxt is the Vue host. The first target is for either
host to render a page on the server and hydrate it in the browser without
starting the browser WASM runtime on the server.

The host framework renders a stable empty Vooya host element. Generated Store
state is `undefined` in server HTML and during initial hydration. After the
host hydrates, the adapter loads WASM and mounts the Rust-owned subtree or
creates an instance-scoped Store. Applications render their own loading state.
Server requests must not create or share Rust Store instances.

This is **SSR-safe island integration**, not server rendering of Rust DOM
content. Current Rust components call browser DOM APIs. Generating their HTML
on the server and hydrating that Rust-owned subtree requires a separate render
contract, state transfer, and ownership design. It is not accomplished by adding
`use client`, disabling SSR, or wrapping everything in a client-only component.

## Foundation in this change

- Vue's generated Store passes a lazy factory to `useVooyaStore`; the factory
  starts only after mount. The advanced composable also accepts factories.
  Passing an already-created Store/Promise cannot undo work the caller started;
  use the factory form for browser-only WASM in an SSR application.
- The built React adapter preserves its `use client` directive. A Next.js module
  that calls `defineVooyaComponent` or `defineVooyaStore` still needs its own
  client boundary; server components cannot call those client-module factories.
- Adapter tests render in Node without a DOM, hydrate existing host elements,
  verify separate Store instances, and check cleanup. The hydration tests use
  JSDOM and mock bindings; they are not Next/Nuxt or real-WASM browser evidence.
- `buildApplication` delegates to the internal Rust reference provider. Its
  public options, result, locking, staged installation, diagnostics and helper
  exports remain compatible. Bundlers need no new `provider` option.

## Next.js acceptance before claiming support

Use an actual App Router fixture with a server-rendered parent and a client
island. Next.js client components can still be prerendered on the server;
`use client` does not make module evaluation browser-only.

The source-loading route is still open work. Vooya's current Webpack adapter
handles legacy `.voo` fixtures, not `.rs`, and Next's Turbopack does not apply
Webpack configuration. Choose and document a tested prebuild/artifact route or
a real `.rs` bundler integration before publishing Next setup instructions.
Do not silently require users to abandon the default bundler.

The fixture must verify production build, HTML before JavaScript, real WASM
asset delivery, hydration without recovery warnings, actions/prop updates,
client navigation and unmount cleanup. Pin the tested Next version, router and
bundler. Other combinations, including Edge runtime, need separate evidence.

References: [Next server/client components](https://nextjs.org/docs/app/getting-started/server-and-client-components),
[client directive](https://nextjs.org/docs/app/api-reference/directives/use-client),
and [Turbopack configuration](https://nextjs.org/docs/app/api-reference/turbopack).

## Nuxt acceptance before claiming support

Use an actual SSR-enabled Nuxt fixture with the normal Vite integration and
ordinary `.rs` imports. Exercise both server and client builds; ensure generated
WASM URLs and imports survive Nitro output. Rendering a server page must neither
fetch nor instantiate browser WASM. A blanket `ssr: false` or `<ClientOnly>`
wrapper does not establish the normal hydration contract.

Verify production build/start, server HTML, browser hydration, real component
and Store interactions, route navigation, cleanup, and independent requests.
Pin the tested Nuxt/Vite versions. The generic Vue adapter tests are groundwork,
not proof that Nuxt's complete build pipeline works.

Reference: [Nuxt lifecycle](https://nuxt.com/docs/3.x/guide/concepts/nuxt-lifecycle).

## Provider extraction stages

1. **Internal Rust seam:** implemented here. Compilation lives in
   `rust-provider.ts`; the public facade delegates through `BuildProvider`.
   Rust-specific options/schema remain on the Rust side.
2. **Normalized artifacts:** still needed. The initial internal artifact shape
   retains one JavaScript entry and one WASM file for compatibility. It is not
   yet the multi-asset/versioned manifest proposed in
   [language-provider research](language-provider-research.md). Add environment
   requirements, runtime assets and provider cache identity before another
   language or an independently distributed artifact relies on it.
3. **Separate consumption from compilation:** a precompiled consumer should
   load an artifact without Cargo, including in Next/Nuxt builds. Keep Rust
   schema interpretation and binding generation behind the provider boundary.
4. **Broader providers:** validate the seam with the scoped canaries from the
   research, rather than exposing an unproven public provider registry.

The Rust reference provider still emits a browser runtime. Extracting it does
not enable server-side Rust rendering or make arbitrary WASM a Vooya component.

## Release gate

Keep the existing Beta regression and packed/registry checks. Add named
Next.js and Nuxt production/browser commands to release CI once implemented,
then update the support matrix with their exact scope. SSR-safe islands,
server-rendered Rust content, and multi-language support must remain separate
claims. The published Beta matrix stays unchanged until those gates pass.
