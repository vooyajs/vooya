# Turbopack Research

This post-beta research record addresses [Issue #38](https://github.com/vooyajs/vooya/issues/38).
The bounded reproduction in [Issue #154](https://github.com/vooyajs/vooya/issues/154)
tests one documented loader boundary. Neither issue adds a Turbopack
compatibility claim or a Next.js adapter.

## Result

Vooya does not yet have a verified Turbopack source-authoring integration.
The documented loader API does not support `emitFile`, which prevents reusing
Vooya's existing loader-side asset emission unchanged. A complete alternative
for shared Rust builds and generated assets has not been demonstrated here.

This is a limitation of the investigated integration path, not proof that
Turbopack cannot support Vooya. Dependency registration and resolution already
exist. The remaining work is to test whether those capabilities can support a
coherent build, asset, invalidation, and failure-recovery design.

## Investigated Boundary

Next.js supports rules that invoke a loader returning JavaScript. For current
Rust-file authoring, the configuration shape would be:

```js
// next.config.js — illustrative rule, not a working Vooya integration
module.exports = {
  turbopack: {
    rules: {
      "*.rs": {
        loaders: ["./vooya-loader.js"],
        as: "*.js",
      },
    },
  },
};
```

No `vooya-loader.js` is supplied by this research. The rule alone does not
establish that generated WASM or runtime assets enter the application output.

The implementation evidence below is pinned to Next.js `16.3.6`, whose
Turbopack loader bridge is part of the Next.js source tree. The [official
configuration reference](https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack)
was also checked on 2026-10-02; that live page then showed version `16.3.8`.
The repository includes `npm run test:turbopack-blocker`, a clean Next.js
`16.3.6` reproduction that imports a local `.rs` file from a client component.
Its loader attempts the documented asset-emission operation and asserts that
Turbopack rejects it. The reproduction proves this specific production asset
boundary; it does not build Rust or establish browser compatibility. Run it
from a checkout with npm registry access:

```sh
npm run test:turbopack-blocker
```

## Established Capabilities And Limits

- The official reference lists `emitFile` as unsupported. A loader cannot use
  that API to publish Vooya's generated WASM into the production asset graph.
- The Next.js `16.3.6` [loader bridge](https://github.com/vercel/next.js/blob/v16.3.6/turbopack/crates/turbopack-node/js/src/transforms/webpack-loaders.ts#L543-L549)
  forwards `fileDependencies` and `contextDependencies` from loader execution
  to Turbopack. It is incorrect to describe this boundary as having no file or
  directory dependency registration.
- The same implementation provides [getResolve](https://github.com/vercel/next.js/blob/v16.3.6/turbopack/crates/turbopack-node/js/src/transforms/webpack-loaders.ts#L218).
  The documentation's unsupported callback-style `this.resolve` does not mean
  all loader-context resolution is absent.
- The official reference also lists `importModule` and `loadModule` as
  unsupported and describes partial `fs` support. These constrain an adapter
  design; by themselves they do not prove that every design is impossible.

These are capabilities and limits of the inspected loader boundary. They do
not verify Vooya's Cargo dependency graph, browser reload behavior, or asset
publication through that boundary.

## Integration Questions Still Open

Vooya builds shared runtime JavaScript and WASM for multiple Rust imports. Its
build also produces CSS, declarations, contract metadata, watched inputs, and
mapped diagnostics. A future adapter must establish:

- **Build coordination:** one coherent build for concurrent imports, without
  duplicate Cargo work or partially published output. The loader bridge does
  not by itself demonstrate the compilation lifecycle used by the current
  Webpack and Rspack integrations.
- **Production assets:** a supported path for generated JS, WASM, and CSS,
  with correct URLs and cache behavior. Unsupported `emitFile` rules out that
  specific mechanism; another asset-graph design needs a fixture. Declarations
  and build metadata need an explicit owner as well, rather than assuming all
  outputs are browser assets.
- **Development invalidation:** registration of actual Rust files and Cargo
  path-dependency directories, including edits, additions, and removals. The
  existing dependency bridge is a starting point, not evidence that Vooya's
  whole watch graph has been integrated.
- **Failure and recovery:** mapped Rust diagnostics, cleanup after failure,
  corrected-source rebuilds without a server restart, and consistent browser
  invalidation when a shared build changes.

Copying files to an unrelated endpoint would need its own URL, cache, and
lifecycle contract. It cannot be counted as normal bundler asset integration
without testing that contract. Private patches are not evidence of a supported
public extension path.

## Reproduction Gate

A focused experiment can investigate these questions using the existing APIs;
it need not wait for watch registration or resolution to be invented. Start
with a clean Next.js consumer and record exact installed versions:

```sh
node --version
npm --version
npx next --version
npm run dev
npm run build
npm run start
```

The fixture must import a local `.rs` component from a client component and
verify production asset loading, browser WASM initialization, mount, prop
update, event delivery, and disposal. Development must additionally verify
Rust and path-dependency watching, mapped diagnostics, failed-build recovery,
and a corrected source edit without restarting the server.

Until that evidence exists, Turbopack remains outside the support matrix.
Passing Webpack, Rspack, or an API-source inspection is not a substitute for
this consumer test.
