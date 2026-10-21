# RFC 0006: Precompiled Vue artifacts

## Status

The initial alpha validation specimen was published as
`@vooya/artifact-vue-counter`. It was retired from the coordinated release unit:
it proved a build contract, not a useful component product. The generic builder
and a test-only consumer proof remain. Historical npm versions are not removed.

## Artifact contents

`buildPrecompiledVueArtifact` from `@vooya/vite/build` accepts one explicit
artifact package root and one source `.rs` component. It validates the package
root, non-empty package identity and version, source location, and a declared
`@vooya/vue` compatibility range. The source must remain under the package root
and output is deliberately restricted to `packageRoot/dist`. It then produces
`dist/manifest.json`, wasm-bindgen JavaScript and WASM under `dist/wasm`, an
optional stylesheet, a Vue component entry, and TypeScript declarations.

The manifest separates the component product's `artifactVersion` from its
`adapter` compatibility record. The adapter record names `@vooya/vue`, the exact
adapter version resolved for the product's installed dependency tree, and the
semver range declared by the product. Product versions are therefore independent of adapter releases;
the build rejects a missing, malformed, or out-of-range adapter dependency.
The range uses npm's normal prerelease rules: an alpha adapter needs a range that
explicitly includes that prerelease, such as `^0.2.0-alpha.0`; `*` does not include it.
The manifest also describes every loading asset: the wasm-bindgen JavaScript
`loader`, the `wasm` binary, the optional `stylesheet`, and the `types`
declaration.

The entry is generated from those manifest asset paths. Output validation
checks package-relative paths, verifies that the entry imports exactly the
advertised mount/update/dispose bindings and `voo_abi_version`, confirms that
the shipped loader exports those names, and checks that the loader's WASM URL
and the manifest embedded in the entry both match `manifest.json`.

## Compatibility

This slice supports Vue only. React artifact consumption is not implemented.
An ABI disagreement throws `Vooya artifact ABI mismatch for <component>:
artifact expects <expected>, but WASM provides <actual>.` before mount. The
independently versioned product declares a semver `@vooya/vue` range; package
managers install the adapter transitively and the build records the exact
adapter version resolved for the product.

## Consumer boundary

The producer needs the existing Rust and wasm-bindgen build path. The retained
clean fixture packs the product, installs it in a clean Vite project without
Rust tools, resolves the public export through the package `exports` map,
receives `@vooya/vue` transitively, loads package-relative WASM/CSS assets under
a non-root base, and verifies mount, update, dispose, and scoped styles in
Chromium. It is not an installation API.

Any future precompiled package must be named for a component product users
actually adopt, carry its framework adapter transitively, and have a clean
consumer contract. It must not use `artifact-*` or a demo name as its product
identity.

## Non-goals

No npm publication, remote registry, React support, event/diagnostics ABI
freezing, SSR, hydration, slots, or cross-island state are included.
