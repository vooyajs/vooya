# SSR and the 0.2 provider boundary

SSR integration and Rust provider extraction are the next **0.2.0 feature
workstream**. They are not part of the published 0.1 Beta support promise.
The [release-line review](../maintainers/release-lines.md) defines the batch
and maintenance candidates. A patch Changeset alone does not make a change
suitable for 0.1. Do not edit package versions or publish 0.2 before acceptance.

## First target: SSR pages with client-mounted WASM islands

Nuxt is the verified source consumer for the proposed batch. Next.js is a
research target, not a requirement or support claim for the first 0.2 alpha.
The island contract lets a host render a page on the server and hydrate it in
the browser without starting the browser WASM runtime on the server.

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

## Unreleased source foundation

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

## API behavior during SSR

| API | Server rendering | Browser lifecycle |
| --- | --- | --- |
| `defineVooyaComponent` | Renders the empty host; does not call `loadBindings` | Mounts after hydration; forwards props/events; disposes on unmount |
| Generated `use<Name>()` Store hooks | Snapshot is `undefined`; no Store is created | Creates one Store per hook call, subscribes, then unsubscribes/disposes on unmount |
| Vue `useVooyaStore(() => createStore())` | Leaves the factory idle | Creates after mount; reports creation failures through `onError` |
| React `useVooyaStore(factory, props, options)` | Leaves the factory idle | Creates in an effect; both synchronous throws and rejected promises reach `onError` |
| Generated `create<Name>Store()` | Explicitly starts runtime loading when called; not automatically deferred | Caller manages subscriptions and disposal when used without a hook |
| Bindings `mount(host, ...)` | Requires a browser DOM host; not a server renderer | Caller owns update/disposal when used without an adapter |

Do not dispatch Store actions while the snapshot is `undefined`. Shared module-level
Store instances are not request-scoped. Passing Vue an already-created Store or
Promise cannot defer work that has already started.

`npm run test:nuxt-ssr` builds and installs six packed Vooya packages in a fresh
Nuxt 4.5.2 / Vite 8.3.1 / Vue 3.5.43 consumer. It checks production Node SSR,
real WASM delivery, two independent Stores, props/events, scoped CSS, client route
navigation, Rust component/Store disposal, and fresh state after returning.
The dedicated PR CI job runs this fixture; it is also in `verify:e2e`.
This fixture does not establish Next.js, Edge runtime, or Rust server HTML support.
Nuxt sets Vite's root to `app` in this fixture, so Rust files live in `app/src`.
The build core also supports `sourceRoot: "."`; it normalizes source paths and
excludes dependency and generated directories from discovery.

## Next.js acceptance before claiming support

Use an actual App Router fixture with a server-rendered parent and a client
island. Next.js client components can still be prerendered on the server;
`use client` does not make module evaluation browser-only.

The Next-specific source-loading route is still open work. Vooya's Webpack
adapter supports `.rs` inputs for Vue and React, but this alone does not validate
Next.js integration. Next's Turbopack does not apply Webpack configuration.
Choose and document a tested prebuild/artifact route or a Next-specific `.rs`
bundler integration before publishing Next setup instructions.
Do not silently require users to abandon the default bundler.

The fixture must verify production build, HTML before JavaScript, real WASM
asset delivery, hydration without recovery warnings, actions/prop updates,
client navigation and unmount cleanup. Pin the tested Next version, router and
bundler. Other combinations, including Edge runtime, need separate evidence.

References: [Next server/client components](https://nextjs.org/docs/app/getting-started/server-and-client-components),
[client directive](https://nextjs.org/docs/app/api-reference/directives/use-client),
and [Turbopack configuration](https://nextjs.org/docs/app/api-reference/turbopack).

## Nuxt acceptance contract

The named current-source Nuxt fixture above exercises the following contract.
Retain it for the release candidate; it is not yet published compatibility.
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

1. **Rust package boundary (unreleased):** `@vooya/provider-rust` owns compilation,
   schema, workspace, and toolchain behavior. `@vooya/build-core` re-exports the
   existing API for compatibility. The internal `BuildProvider` seam remains
   Rust-shaped and is not a public extension protocol.
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

Keep the existing beta regression and packed/registry checks, and retain the
named Nuxt production/browser acceptance for the candidate. Add Next.js only
when its own integration and acceptance exist; do not infer it from React or
Nuxt tests. Update the matrix after publication with exact versions. SSR-safe islands,
server-rendered Rust content, and multi-language support must remain separate
claims. The published Beta matrix stays unchanged until those gates pass.
