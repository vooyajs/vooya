# RFC 0004: Precompiled Component Artifact V1

## Status

Accepted for an implementation prototype. This RFC does not authorize npm
publication or promise artifact compatibility across alpha releases.

## Problem

Source `.voo` components currently compile inside the consuming application.
That gives authors a direct Rust workflow, but it requires every consumer to
install Cargo, the `wasm32-unknown-unknown` target, and `wasm-bindgen-cli`.

Vooya's component boundary becomes a distribution boundary only when a Rust
component author can compile once and JavaScript applications can consume the
result as an ordinary package without a Rust toolchain.

## Decision

V1 defines one precompiled artifact as one source `.voo` component compiled to
one WASM module. The artifact is a normal npm package with host-specific entry
points generated from one host-neutral component implementation.

```text
Rust author or CI                    Vue / React consumer
----------------                    --------------------
Counter.voo                          npm install package
  -> Cargo + wasm-bindgen            import Counter
  -> artifact npm package            no Rust toolchain
```

The initial builder is a JavaScript API exported by
`@vooya/vite-plugin/artifact`. A public CLI is deferred until the manifest and
authoring workflow have real usage evidence.

## Package layout

```text
package/
├── package.json
├── vooya.manifest.json
└── dist/
    ├── runtime.js
    ├── runtime_bg.wasm
    ├── style.css
    ├── vue.js
    ├── vue.d.ts
    ├── react.js
    └── react.d.ts
```

`style.css` is omitted when the component has no style block. Both framework
entries import the same runtime and optional stylesheet.

## Manifest V1

```json
{
  "schemaVersion": 1,
  "artifact": "vooya-component",
  "name": "Counter",
  "package": "@example/counter",
  "abiVersion": 1,
  "runtime": "./dist/runtime.js",
  "wasm": "./dist/runtime_bg.wasm",
  "styles": ["./dist/style.css"],
  "hosts": {
    "vue": "./dist/vue.js",
    "react": "./dist/react.js"
  },
  "props": [],
  "events": []
}
```

Props and events use the existing generated adapter definition rather than a
second contract format. Paths are package-relative and must remain inside the
artifact.

## Runtime behavior

- The WASM module initializes once per JavaScript module instance.
- Vue and React entry points use their existing Vooya adapters.
- Every mount receives its own Rust component handle.
- ABI compatibility is checked before the first mount.
- Host unmount calls the generated Rust dispose export.
- Loading and mount failures use the existing adapter error contract.

## npm dependency contract

The artifact declares `@vooya/vue` and `@vooya/react` as optional peer
dependencies. A consumer installs only the adapter for the host entry point it
imports. Adapter versions must match the artifact's Vooya alpha version.

The artifact contains compiled component code, not `@vooya/core` Rust source,
and does not depend on `@vooya/vite-plugin` at consumer build or runtime.

## Verification gate

The prototype is accepted only when one generated Counter package:

1. builds from source with the Rust author toolchain;
2. can be packed as an npm tarball;
3. builds in isolated Vue and React consumer projects;
4. emits the WASM asset in both consumers;
5. performs consumer builds with Cargo, rustc, rustup, and wasm-bindgen absent
   from `PATH`.

Browser lifecycle parity remains covered by the source-component host suite.
A later stage must run the packed artifact itself in a browser before the
format is considered production-ready.

## Non-goals

- Multiple components in one artifact.
- Shared WASM across independently published packages.
- SSR or hydration.
- CDN, import-map, or non-bundler loading.
- Complex props beyond the source component contract.
- Backward compatibility across alpha ABI revisions.
- Automatic npm publication.

## Deferred decisions

- Whether application packages should share one WASM module.
- Artifact signing, integrity metadata, and provenance.
- Lazy versus eager stylesheet loading.
- A public CLI and configuration file.
- Web Component and Astro entry points.
- Source maps and Rust debug metadata for precompiled packages.
