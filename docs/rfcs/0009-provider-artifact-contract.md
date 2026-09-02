# RFC 0009: Provider-neutral artifact contract

## Status

This is an implementation note for Issue #94. Rust remains the only stable
first-party authoring provider. AssemblyScript and Emscripten are future canary
providers, not supported languages.

## Decision

The bundler and framework layers consume a normalized artifact manifest instead
of assuming that every provider exposes one `WebAssembly.instantiate()` call.
The manifest identifies the provider, optional loader, WASM and supporting
assets, watch files, ABI/contract metadata, and deployment requirements.

Assets may be JavaScript modules, WASM bytes, workers, runtimes, data, styles,
or source maps. A worker must be loaded as a worker, and a loader must refer to
one declared asset. Providers may return multiple WASM or runtime assets.

```ts
interface VooyaArtifactManifest {
  formatVersion: 1;
  provider: string;
  loader?: string;
  assets: ArtifactAsset[];
  environment?: ArtifactEnvironment;
  watchFiles: string[];
}
```

The Rust build path now returns this manifest as part of
`BuildApplicationResult`. Existing Rust compilation, schema extraction,
diagnostics, and framework adapters remain unchanged.

## Boundaries

- Provider-specific source discovery, compiler setup, loaders, runtimes, and diagnostics stay with the provider.
- Host adapters must not infer a language from asset names or call Cargo directly.
- An artifact is not automatically a Vooya component without contract and ABI metadata.
- WASI and browser DOM integration remain separate capabilities.
- Managed toolchain installation and arbitrary untrusted code execution are out of scope.

## Next evidence

The contract is considered provisional until an AssemblyScript AOT canary and an
Emscripten multi-file/worker canary pass the same lifecycle and ABI suite.
Those canaries must also test offline asset loading, failure cleanup, cache
invalidation, source diagnostics, and required browser headers.
