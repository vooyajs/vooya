# Beta Boundary

Vooya's beta focuses on one practical path: ordinary Rust files compiled to
WASM and consumed by Vue or React through the first-party adapters.

## Authoring decision

The current authoring path is `.rs` with explicit component or store roles.
`rsx!` is available for DOM-owned Rust components; stores keep state and
actions in Rust while Vue or React keeps rendering.

The earlier `.voo` format combined a manifest, Rust, and CSS in one custom file.
It was useful for validating the first component-island idea, but it required a
parallel parser and formatter and hid Rust from normal rust-analyzer and Cargo
tooling. It also created a second source of truth for the public contract. The
Rust-file path removes those costs. Any remaining `.voo` code is transitional
compatibility coverage, not the beta authoring recommendation.

## Beta product boundary

- Vue 3 and React 19 adapters for Rust-file components and instance-scoped stores.
- Vite 7 and Vite 8 source builds; Vite+ is a separate compatibility smoke path.
- Vue Vapor is experimental and depends on Vue's own Vapor interop setup.
- Webpack and Rspack are experimental integration paths.
- ABI v1 covers the documented primitive, bigint, nullable, tuple, vector, and
  string-key map cases.
- No global store, SSR, hydration, precompiled component product, or Turbopack
  support is promised by beta.

## Lifecycle contract still being frozen

The public lifecycle error has one shape in both adapters:

```ts
type VooyaLifecycleError = {
  stage: "load" | "mount" | "update" | "dispose";
  cause: unknown;
};
```

The phases mean:

| Stage | Meaning | Required behavior |
| --- | --- | --- |
| `load` | Bindings or WASM loading failed | Report through the framework error channel; never mount a partial handle |
| `mount` | Rust mount failed after bindings loaded | Remove listeners and report the failure |
| `update` | A prop patch failed | Keep the existing handle and report the failed patch |
| `dispose` | Cleanup threw during unmount | Complete listener cleanup and report the cleanup failure |

Unmount is terminal for an instance. A binding or store factory that resolves or
rejects after unmount must not mount, dispose twice, or invoke stale user
callbacks; a late-created store is disposed immediately. Normal component and
store disposal releases listeners and subscriptions deterministically.

Development-only host diagnostics may include a bounded error name/message and
timing, but must not expose props, payloads, stacks, or original error objects.

## Evidence

The support matrix in [compatibility.md](compatibility.md) is evidence for the
named commands and versions only. A passing fixture does not expand the public
support claim beyond its row.

## Toolchain and Distribution Strategy

Vooya's core product is the authoring and build experience, not a catalog of
business components.

### Beta toolchain contract

These modes deliberately separate who writes Rust from who only installs a
published component. They are product boundaries, not interchangeable setup
instructions.

| Mode | Toolchain owner | Beta status | Contract |
| --- | --- | --- | --- |
| Source author | Application author | Supported | The author supplies Cargo, a compatible Rust toolchain with `wasm32-unknown-unknown`, and pinned `wasm-bindgen-cli`. Vooya compiles ordinary `.rs` components and stores through the documented source integration paths. |
| System toolchain | Application author or host application | Supported | `toolchain.cargoPath` selects Cargo explicitly. `vooya doctor --cargo-path` and the build resolve Cargo's own `rustc`, target, and `wasm-bindgen` chain together; an incomplete explicit selection fails without falling back to another Cargo. |
| Managed toolchain | Vooya | Not promised | Vooya does not download, install, update, or cache Rust/WASM tools in beta. A future design must define platform binaries, checksums, cache location, offline behavior, upgrades, custom dependencies, and security review. |
| Precompiled consumer | Artifact publisher | Not promised | A supported package format with framework entry points, JavaScript, WASM, declarations, CSS, ABI policy, and publishing conventions does not exist yet. The Vue fixture is internal build-contract evidence, not a public artifact product. |

Only source-author and system-toolchain modes are beta support claims. They
both require Rust; system-toolchain mode changes selection and ownership, not
the Rust requirement. No user-facing documentation may claim that a source
author can use Vooya without a Rust installation. A future precompiled consumer
may truthfully make that claim only after its package contract is published and
supported.

### Artifact boundary

Vooya should define a versioned artifact contract for WASM, JavaScript bindings,
CSS, declarations, framework entries, and ABI metadata. That contract lets an
ecosystem or an internal team publish packages such as a data grid or chart:

```ts
import DataGrid from "@vendor/vooya-data-grid/vue";
```

Vooya itself does not need to publish business-component libraries. Those are
second-level products built by vendors, teams, or the community. The artifact
work therefore specifies interoperability and consumer validation, while
component branding, domain APIs, and release cadence belong to the publisher.
