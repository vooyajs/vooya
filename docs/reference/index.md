# Reference

- [API reference](./api.md): public package exports and consumption paths.
- [Tooling reference](./tooling.md): configuration, workspace, CLI, and bundler
  behavior.

Reference pages describe the interfaces that are useful when a project moves
beyond the first example. They are intentionally precise about alpha behavior;
experimental integrations are marked as such instead of being presented as a
universal bundler promise.

## Reference map

- [Tooling](./tooling.md): Vite, Rspack/Rsbuild, Webpack, `vooya doctor`, generated
  files, and development rebuild behavior.
- [Rust-file authoring](../guide/rust-file-authoring.md): role attributes,
  components, stores, `rsx!`, events, and the ABI v1 value boundary.
- [Compatibility matrix](../project/compatibility.md): the exact fixtures behind
  each framework and bundler claim.
- [RFC 0007](../rfcs/0007-rust-file-authoring-and-abi-v1.md): the design record for
  schema, declarations, stores, and ABI v1.

## Versioning rule

All `@vooya/*` packages are released as one coordinated unit. Use one exact
version across the package set and prefer the npm `alpha` tag while the project
is in prerelease. Alpha ABI changes can be breaking.
