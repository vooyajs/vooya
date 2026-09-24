# Turbopack Research

This is a post-beta research record for Issue #38. It does not add a
Turbopack compatibility claim or a Next.js adapter.

## Result

The documented Next.js/Turbopack extension surface is not sufficient for the
current Vooya source build contract. A Turbopack rule can invoke a loader that
returns JavaScript for a matching source file, but the documented loader
surface does not provide the coordinated build and asset lifecycle required by
Vooya.

The smallest viable future boundary would need a documented public hook that
can coordinate one shared Rust/WASM build, emit its generated assets, register
all watched files, and report recoverable mapped diagnostics. Until that hook
exists, a Turbopack integration would require undocumented or patched
internals, an external daemon/file-copy protocol, or an asset path outside the
normal production graph.

## Investigation Versions

The repository investigation was performed with:

| Tool | Version or source |
| --- | --- |
| Node.js | `v24.12.0` |
| npm | `11.6.2` |
| Next.js | Not installed in this repository; the documented API page was checked for Next.js `16.3.6` |
| Turbopack | Bundled by Next.js; no standalone version is exposed or installed here |
| React | Repository consumers use React `19.x`; no Next.js consumer was run |

The conclusions below are based on the documented public API, not on Webpack or
Rspack behavior. The relevant documentation is the [Next.js Turbopack
configuration reference](https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack),
checked on 2026-09-24.

## Attempted Public Boundary

The only documented configuration shape relevant to a local `.voo` source is a
Turbopack rule that maps the source to a JavaScript loader result:

```js
// next.config.js
module.exports = {
  turbopack: {
    rules: {
      "*.voo": {
        loaders: ["./vooya-loader.js"],
        as: "*.js",
      },
    },
  },
};
```

This boundary can potentially transform source text into a client-side React
module. It does not establish that Vooya can build or load the generated WASM,
CSS, runtime JavaScript, declarations, or ABI metadata.

## Blockers

Vooya's shared `buildApplication()` result includes runtime JavaScript, WASM,
generated CSS, declarations, metadata, watched files, and mapped diagnostics.
The existing Vite, Webpack, and Rspack integrations call that shared pipeline
from a bundler lifecycle rather than independently from a source loader.

The documented Turbopack loader boundary has the following gaps:

- `emitFile` is unsupported, so a loader cannot emit the generated WASM into
  the normal production asset graph.
- There is no documented equivalent of Webpack's compilation/plugin hooks for
  running one coordinated Rust/WASM build and publishing its generated assets.
- The loader API does not expose the repository-level watch registration needed
  to consume `BuildApplicationResult.watchedFiles`, including Rust path
  dependencies.
- The documented loader surface does not provide the complete rebuild,
  failure-recovery, and mapped-diagnostic lifecycle used by the existing
  adapters.
- Partial `fs` support and missing loader features such as `importModule`,
  `loadModule`, and loader-context `resolve` prevent a clean replacement for
  the current adapter state model.

Copying WASM beside the source or serving it through an unrelated endpoint would
not be equivalent to normal bundler asset emission and would not satisfy the
source integration contract. Implementing the missing lifecycle through private
Next.js/Turbopack internals is explicitly outside this investigation.

## Production And Development

The two paths have different blockers:

- **Production:** JavaScript transformation is representable by a loader, but
  generated WASM, CSS, runtime assets, declarations, and ABI metadata cannot be
  proven to enter the normal output graph through the documented API.
- **Development:** even if production assets were copied by an external
  workaround, the public loader rule does not provide the watched-root,
  rebuild-scheduling, failed-build recovery, and browser invalidation contract
  needed for `.voo`, Rust, and configured path-dependency edits.

Therefore the repository does not add a Next.js fixture, test command, or
compatibility-matrix row. Webpack and Rspack fixtures remain evidence for those
bundlers only.

## Reproduction Plan

When Turbopack exposes the missing public hooks, validate the smallest clean
Next.js consumer with exact installed versions:

```sh
node --version
npm --version
npx next --version
npm run dev
npm run build
npm run start
```

The fixture must import a local `.voo` file from a client component and verify
production asset emission, browser WASM initialization, mount, prop update,
event delivery, and disposal. Development must additionally verify Rust and
path-dependency watching, mapped diagnostics, failed-build recovery, and the
behavior after a corrected source edit.

This record should be replaced or amended only after those checks run against a
clean fixture using documented public extension points.
