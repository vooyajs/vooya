# RFC 0008: Vooya as a WASM Integration Layer

## Status

Draft for the 0.1 release line. This document records the product boundary and
the staged direction after the Rust-file authoring work. The version themes are
planning targets, not release commitments.

## Summary

Vooya is a **WASM integration layer for existing Web applications**. It is not
a replacement for Vue, React, a routing framework, a state-management library,
or a general Rust application renderer.

Vooya connects browser-compatible Rust code to an application that already has
a host framework and bundler. The host keeps the application shell; Vooya
provides the build, ABI, lifecycle, and diagnostics boundary for a bounded Rust
capability.

```text
existing application
  Vue / React / host renderer
  routing, page tree, business state
          |
          | typed props, events, store snapshots, lifecycle
          v
  Vooya integration layer
  compiler, build core, bundler adapter, framework adapter
          |
          v
  Rust -> wasm32-unknown-unknown -> browser Web APIs
```

## Product boundary

### Vooya owns

- Rust-file discovery and role metadata;
- Cargo and `wasm-bindgen` orchestration for browser-compatible builds;
- schema extraction, ABI validation, and generated TypeScript declarations;
- component props, events, store actions, lifecycle, errors, and disposal;
- the Rust-owned DOM subtree below a host-provided element;
- framework adapters that expose the same boundary to Vue and React; and
- bundler integrations that emit browser-consumable JavaScript, WASM, and CSS.

### The host application owns

- the page tree, routing, application state, and surrounding DOM;
- the choice and configuration of Vue, React, or another renderer;
- native operating-system APIs, IPC, filesystem access, and permissions;
- the desktop shell, if the application uses Electron or Tauri; and
- capabilities that cannot compile for or run in the browser Web API boundary.

The Vooya runtime must not require Electron, Tauri, Node.js, or a desktop shell.
An application may use those hosts around a Vooya renderer, but their native
APIs are not part of the component ABI.

## Why this is a layer

The integration problem is repeated whenever a Web application wants to reuse a
Rust crate: WASM initialization, asset handling, framework bindings, types,
events, cleanup, errors, and development rebuilds all have to agree. Vooya
standardizes that boundary without asking the application to replace its
framework or rendering model.

This also keeps the portability claim precise:

- a pure Rust/WASM function may target browsers, workers, Node, or WASI through
  different bindings;
- a Vooya DOM component targets a browser-compatible renderer and Web APIs;
- Electron renderer compatibility is primarily a Chromium host check;
- Tauri compatibility is a WebView host check whose exact behavior depends on
  WebKit, WebView2, or WebKitGTK; and
- native APIs belong to the host application, not to the Vooya component ABI.

Electron and Tauri therefore do not need separate Vooya runtimes. They become
additional host environments only when a real product needs evidence for them.

## Toolchain boundary

Source authoring requires a Rust toolchain capable of compiling
`wasm32-unknown-unknown` and the pinned `wasm-bindgen` CLI. The selected Cargo
is the source of truth for the rustc used by the build; a future explicit
toolchain configuration may select or inherit a project toolchain, but an
isolated `rustcPath` must never silently disagree with Cargo.

For a Tauri application, the desired relationship is:

```text
Tauri native Cargo build  -> host target
Vooya generated Cargo build -> wasm32-unknown-unknown
             both selected from the same project toolchain policy
```

Sharing a Rust toolchain does not merge the native Tauri crate with the
generated WASM crate. The build system must keep their targets, generated state,
diagnostics, and output assets separate while allowing a project to declare one
coherent toolchain policy.

## Version roadmap

### 0.1: Integration layer foundation

The first beta should make one path trustworthy:

- ordinary `.rs` files with `#[voo::component]` and `#[voo::store]`;
- `voo::rsx!` for the Rust-owned DOM surface;
- typed primitive ABI v1, lifecycle, errors, events, stores, and disposal;
- Vite as the primary source-authoring path;
- experimental, explicitly bounded Rspack and Webpack paths;
- generated declarations under `.vooya/types`;
- clean-machine diagnostics and reproducible browser evidence; and
- removal of the exploratory `.voo` authoring path.

Electron, Tauri, SSR, hydration, and a general-purpose Rust renderer are not
0.1 compatibility promises.

### 0.2: Authoring and distribution hardening

The next stage should reduce the cost of adopting the layer:

- explicit inheritance or selection of a project's Rust toolchain policy;
- better `vooya doctor` output and failure recovery;
- stable generated workspace and declaration conventions;
- richer, versioned schema diagnostics without silently widening ABI v1;
- a real precompiled artifact producer/consumer contract; and
- starter projects and documentation that make the first successful build
  repeatable.

Electron renderer smoke evidence may begin here, but it is not automatically a
support promise for every Electron builder or packaging mode.

### 0.3: Additional Web API hosts and ecosystem evidence

This stage may expand the host evidence after the browser layer is stable:

- Electron renderer production packaging and resource loading;
- Tauri WebView fixtures for named operating-system targets;
- a decision on whether any host-specific build helper is actually necessary;
- broader browser/WebView compatibility evidence; and
- real product examples that use local data, parsing, graphics, or high-frequency
  interaction rather than another counter demo.

Tauri's native API, IPC, and permission model remain application concerns. A
`@vooya/tauri` package requires a concrete build or resource-protocol problem;
the existence of Tauri alone is not sufficient justification.

### 1.0: Stable layer contract

The stable release requires evidence rather than an expanded feature list:

- a versioned ABI and compatibility policy;
- named browser, framework, bundler, and host boundaries;
- predictable source and precompiled consumer workflows;
- documented failure and disposal behavior; and
- a clear rule for what remains the responsibility of the host application.

SSR, hydration, a framework replacement, and a general Rust renderer remain
separate proposals unless a future RFC changes this boundary.

## Acceptance criteria for this RFC

- README and documentation describe Vooya as a layer rather than a framework;
- current examples and package names do not imply that Vooya owns the whole
  application;
- Electron and Tauri are described as host environments, not runtime adapters;
- each roadmap stage names its boundary and does not promise unsupported
  compatibility; and
- implementation issues can reference this RFC without importing private
  coordination notes or marketing claims.

## Non-goals

- defining a new template language beyond the current Rust-file/`rsx!` path;
- adding native permissions or IPC to the Vooya ABI;
- claiming that WASM is universally faster;
- creating empty Electron/Tauri packages before a concrete integration need;
- promising every WebView, browser, bundler, or desktop packager; or
- publishing a business-component library under the Vooya core repository.
