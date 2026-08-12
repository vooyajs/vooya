# RFC 0004: Precompiled Component Artifact V1

## Status

Accepted for build-format prototyping. Runtime artifact conformance is not yet
accepted. This RFC does not authorize npm publication or promise artifact
compatibility across alpha releases.

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
  "vooyaVersion": "0.1.0-alpha.3",
  "abiVersion": 1,
  "runtime": "./dist/runtime.js",
  "wasm": "./dist/runtime_bg.wasm",
  "styles": ["./dist/style.css"],
  "hosts": {
    "vue": {
      "entry": "./dist/vue.js",
      "adapterVersion": "0.1.0-alpha.3"
    },
    "react": {
      "entry": "./dist/react.js",
      "adapterVersion": "0.1.0-alpha.3"
    }
  },
  "props": [],
  "events": []
}
```

Props and events use the existing generated adapter definition rather than a
second contract format.

`schemaVersion` controls the manifest's JSON fields and path interpretation.
`abiVersion` controls the JavaScript-to-WASM function and value contract.
`vooyaVersion` records the compiler/runtime release that produced the artifact.
Each host records the exact adapter version required by this alpha artifact;
the generated npm package repeats those requirements as peer dependencies.

Every manifest path must:

- start with `./` and use forward slashes;
- be relative to the package root after normalization;
- contain no `..` segment;
- not be an absolute path, URL, or protocol-relative URL;
- resolve without traversing a symbolic link.

Manifest readers must reject a path whose normalized or real filesystem target
escapes the package root. V1 artifact packages must not contain symbolic links.

## Runtime behavior

- The WASM module initializes once for each ESM runtime module instance resolved
  to the same URL. Different installed package copies, realms, or resolved URLs
  are separate instances and do not share initialization.
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

## Build-format verification gate

The prototype is accepted only when one generated Counter package:

1. builds from source with the Rust author toolchain;
2. can be packed as an npm tarball;
3. builds in isolated Vue and React consumer projects;
4. emits the WASM asset in both consumers;
5. performs consumer builds with Cargo, rustc, rustup, and wasm-bindgen absent
   from `PATH`.

Passing this gate validates package construction and consumer bundling only. It
does not accept the runtime behavior listed above.

## Runtime-conformance gate

Before the format can be considered production-ready, the packed npm artifact
itself must run in real browsers through every supported host and verify:

- WASM initialization and repeated mounts;
- prop updates and component events;
- dispose and remount without leaked DOM, listeners, or handles;
- load failure, ABI mismatch, and Rust mount failure behavior;
- Vue and React entry points importing the same artifact in one application.

The source-component host suite remains useful evidence but does not substitute
for this artifact-specific gate.

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
