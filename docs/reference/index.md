# Reference

- [API reference](./api.md): public package exports and consumption paths.
- [Tooling reference](./tooling.md): configuration, workspace, CLI, and bundler
  behavior.

Reference pages describe the interfaces that are useful when a project moves
beyond the first example. They are intentionally precise about beta behavior;
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

Install from the npm `beta` channel and retain the lockfile. All ten packages
started at `0.1.0-beta.0`; subsequent versions are independent, with exact
internal dependencies maintained by the release workflow. Prerelease ABI
changes can still be breaking.
