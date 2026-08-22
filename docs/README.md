# Vooya Documentation

Vooya compiles Rust component and store implementations into WebAssembly and
exposes them through host-framework adapters for use in web applications. The
current authoring path uses ordinary `.rs` files. Vue and React are the current
first-party adapters.

This directory is the source of truth for user-facing documentation. It is kept
as plain Markdown for now so the content can later move into a documentation
site without changing its structure or URLs unnecessarily.

## Start here

- [Contributing](../CONTRIBUTING.md): project scope, development setup, testing,
  and pull request expectations.
- [Getting started](guide/getting-started.md): install the alpha toolchain and
  run a first component in Vue or React.
- [Rust-file authoring](guide/rust-file-authoring.md): component/store roles,
  schema records, generated bindings, and the Vue/Vite compatibility boundary.
- [The component boundary](concepts/component-boundary.md): what the host
  framework owns, what WASM owns, and why that boundary exists.
- [Tooling reference](reference/tooling.md): Vite options, generated files,
  formatting, editor support, and development rebuilds.
- [Maintainer releases](maintainers/releases.md): release state, alpha
  publication, and the stable-release lifecycle.
- [Project status](project/status.md): what works, what remains experimental,
  and the next milestones.
- [Compatibility matrix](project/compatibility.md): automated framework and
  browser evidence, plus explicit unsupported boundaries.
- [Scatter-plot demo](guide/scatter-plot.md): a repeatable browser check for a
  Rust-owned Canvas rendering surface.

## Design records

The RFCs record decisions and their original stage context. They are not a
substitute for the current guides.

### Proposing an RFC

Open a GitHub issue titled `RFC: <proposal>` first. The issue is where options,
compatibility effects, acceptance gates, and the maintainer decision are
recorded. After a decision, maintainers may add a numbered document here; bugs,
chores, and implementation tasks do not consume RFC numbers. RFC 0008 is the
next available number.

- [RFC 0001: component islands](rfcs/0001-component-islands.md)
- [RFC 0002: reactive component model](rfcs/0002-reactive-component-model.md)
- [RFC 0003: first public alpha](rfcs/0003-production-readiness.md)
- [RFC 0005: island events and lifecycle diagnostics](rfcs/0005-island-events-lifecycle-diagnostics.md)
- [RFC 0006: precompiled Vue artifacts](rfcs/0006-precompiled-vue-artifacts.md)
- [RFC 0007: Rust-file authoring and ABI v1](rfcs/0007-rust-file-authoring-and-abi-v1.md)

Performance work is recorded separately:

- [Data-grid benchmark plan](benchmarks/data-grid.md)
- [July 2026 data-grid result](benchmarks/2026-07-data-grid.md)

## Naming

- **Vooya** is the product and project name.
- **Voo** is the legacy component file format, using the `.voo` extension.
- **`@vooya`** is the npm package scope.
- **`vooya`** is the runtime and public API prefix, such as `vooya()` and
  `data-vooya-host`.
- File-format tooling uses the `voo` prefix, such as `voo-format` and
  `VooParseError`.

The GitHub repository follows the same convention at `vooyajs/vooya`.
