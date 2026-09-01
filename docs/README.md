# Vooya Documentation

Vooya is a WASM integration layer for existing Web applications. It compiles
ordinary Rust component and store implementations into browser-consumable
WebAssembly and exposes them through host-framework adapters. The old `.voo`
format was an exploratory intermediate and is no longer a supported authoring
path. Vue and React are the supported first-party adapters; Solid and Svelte
are experimental with current evidence on the Vite 7 Rust-file path.

This directory is the source of truth for user-facing documentation and is
published as a VitePress site. Markdown remains the canonical content format;
the site adds navigation, search, version context, and deployable static output
without creating a second documentation repository.

## Explore the interactive lab

The [Vooya Lab](https://vooyajs.github.io/vooya-lab/) turns these authoring and
compatibility boundaries into runnable browser cases. Its source lives in the
[vooyajs/vooya-lab](https://github.com/vooyajs/vooya-lab) repository; the lab
links back here for the contracts and guides behind each case.

## Start here

- [Contributing](https://github.com/vooyajs/vooya/blob/main/CONTRIBUTING.md): project scope, development setup, testing,
  and pull request expectations.
- [Getting started](guide/getting-started.md): install the alpha toolchain and
  run a first component through a current Vue, React, Solid, or Svelte adapter path.
- [Rust-file authoring](guide/rust-file-authoring.md): component/store roles,
  schema records, generated bindings, and the current first-party Vite path.
- [API reference](reference/api.md): public package exports, options, and
  current alpha boundaries.
- [The component boundary](concepts/component-boundary.md): what the host
  framework owns, what WASM owns, and why that boundary exists.
- [Tooling reference](reference/tooling.md): Vite options, generated files,
  Rust dependencies, and development rebuilds.
- [Maintainer releases](maintainers/releases.md): release state, alpha
  publication, and the stable-release lifecycle.
- [Project status](project/status.md): what works, what remains experimental,
  and the next milestones.
- [Compatibility matrix](project/compatibility.md): automated framework and
  browser evidence, plus explicit unsupported boundaries.
- [Benchmarks](benchmarks/data-grid.md): workload-specific measurements and
  the limits of their conclusions.
- [Beta boundary](project/beta-boundary.md): the current product scope,
  authoring decision, and remaining contract gate.
- [Scatter-plot demo](guide/scatter-plot.md): a repeatable browser check for a
  Rust-owned Canvas rendering surface.

## Design records

The RFCs record decisions and their original stage context. They are not a
substitute for the current guides.

### Proposing an RFC

Open a GitHub issue titled `RFC: <proposal>` first. The issue is where options,
compatibility effects, acceptance gates, and the maintainer decision are
recorded. After a decision, maintainers may add a numbered document here; bugs,
chores, and implementation tasks do not consume RFC numbers. RFC 0009 is the
next available number.

- [RFC 0001: component islands](rfcs/0001-component-islands.md)
- [RFC 0002: reactive component model](rfcs/0002-reactive-component-model.md)
- [RFC 0003: first public alpha](rfcs/0003-production-readiness.md)
- [RFC 0005: island events and lifecycle diagnostics](rfcs/0005-island-events-lifecycle-diagnostics.md)
- [RFC 0006: precompiled Vue artifacts](rfcs/0006-precompiled-vue-artifacts.md)
- [RFC 0007: Rust-file authoring and ABI v1](rfcs/0007-rust-file-authoring-and-abi-v1.md)
- [RFC 0008: layer boundary and version roadmap](rfcs/0008-layer-boundary-and-roadmap.md)
- [RFC 0009: provider-neutral artifact contract](rfcs/0009-provider-artifact-contract.md)

Performance work is recorded separately:

- [Data-grid benchmark plan](benchmarks/data-grid.md)
- [July 2026 data-grid result](benchmarks/2026-07-data-grid.md)

## Naming

- **Vooya** is the product and project name.
- **`@vooya`** is the npm package scope.
- **`vooya`** is the runtime and public API prefix, such as `vooya()` and
  `data-vooya-host`.
- Rust role attributes and the `vooya` prefix describe the current authoring
  and runtime boundary.
- **Voo** is the retired legacy component file format, using the `.voo`
  extension. File-format tooling may still use the `voo` prefix.

The GitHub repository follows the same convention at `vooyajs/vooya`.
