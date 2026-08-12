# Vooya Documentation

Vooya compiles Rust component implementations from `.voo` files into WebAssembly
and exposes them as ordinary Vue or React components.

This directory is the source of truth for user-facing documentation. It is kept
as plain Markdown for now so the content can later move into a documentation
site without changing its structure or URLs unnecessarily.

## Start here

- [Getting started](guide/getting-started.md): install the alpha toolchain and
  run a first component in Vue or React.
- [Writing `.voo` components](guide/voo-components.md): contracts, Rust
  lifecycle methods, events, styles, and current type limits.
- [The component boundary](concepts/component-boundary.md): what the host
  framework owns, what WASM owns, and why that boundary exists.
- [Tooling reference](reference/tooling.md): Vite options, generated files,
  formatting, editor support, and development rebuilds.
- [Host compatibility](reference/compatibility.md): verified lifecycle,
  event, styling, and error-reporting status for each framework adapter.
- [Project status](project/status.md): what works, what remains experimental,
  and the next milestones.
- [Roadmap](project/roadmap.md): the visible implementation checklist for the
  component ABI, view layer, host adapters, build tools, and distribution.

## Design records

The RFCs record decisions and their original stage context. They are not a
substitute for the current guides.

- [RFC 0001: component islands](rfcs/0001-component-islands.md)
- [RFC 0002: reactive component model](rfcs/0002-reactive-component-model.md)
- [RFC 0003: first public alpha](rfcs/0003-production-readiness.md)
- [RFC 0004: precompiled component artifact](rfcs/0004-precompiled-component-artifact.md)

Performance work is recorded separately:

- [Data-grid benchmark plan](benchmarks/data-grid.md)
- [July 2026 data-grid result](benchmarks/2026-07-data-grid.md)

## Naming

- **Vooya** is the product and project name.
- **Voo** is the component file format, using the `.voo` extension.
- **`@vooya`** is the npm package scope.
- **`vooya`** is the runtime and public API prefix, such as `vooya()` and
  `data-vooya-host`.
- File-format tooling uses the `voo` prefix, such as `voo-format` and
  `VooParseError`.

The GitHub repository follows the same convention at `vooyajs/vooya`.
