---
layout: home

hero:
  name: Vooya
  text: WASM integration for existing Web applications
  tagline: Bring browser-compatible Rust capabilities into traditional Web applications without replacing the host renderer.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Read the layer boundary
      link: /rfcs/0008-layer-boundary-and-roadmap

features:
  - title: Keep your host application
    details: The existing Web renderer keeps the page tree, routing, application state, and surrounding DOM.
  - title: Own one bounded capability
    details: Rust owns a component island with typed props, events, lifecycle, and disposal.
  - title: Use the Web ecosystem
    details: Vooya connects Rust and WebAssembly to existing bundlers and framework adapters.
---

## Start with the integration layer

An existing traditional Web application may have one capability that belongs in
Rust, but no team wants to rewrite its page tree, router, business state, or
design system—or hand-write another WASM wrapper for every project. Vooya
standardizes the boundary between that host application and one Rust/WASM
capability island.

Vooya is not a replacement for the host renderer or a full Rust application
framework. It is a framework-agnostic integration layer for the build and
runtime work around that island. Vue and React are the current first-party
adapters; other hosts require their own adapter and evidence.

The short version is: **keep JavaScript, move only the expensive part**. The
application remains the familiar surface, while one focused workload travels
to a Rust/WASM island. That “voyage to island” idea also guides other Vooya
organization projects such as Rush-FS, which keeps a Node-style API while moving
filesystem work to native Rust.

Read [why Vooya](why-vooya.md) for the design context, then the
[component boundary](concepts/component-boundary.md) and [getting started guide](guide/getting-started.md).

After the first run, check the [toolchain reference](reference/tooling.md) and
[compatibility matrix](project/compatibility.md) before choosing a bundler.

## Why choose Vooya?

Choose Vooya when a traditional Web application needs a Rust/WASM capability and
the team wants a maintained integration contract instead of another one-off
wrapper. Vooya standardizes the recurring work around WASM loading, typed ABI,
framework adapters, lifecycle, events, disposal, diagnostics, declarations, and
bundler assets. It makes custom WASM wrappers a repeatable toolchain surface that
can be tested and evolved across projects.

Canvas, WebGL, editors, parsers, data-heavy widgets, local stores, and other
bounded capabilities are reasonable starting points. Keep ordinary page layout,
routing, forms, and application state in the host renderer while the alpha
focuses on the island boundary.

SSR, hydration, and a standalone Rust renderer are not implemented in the
current alpha path. They remain possible future layers, not permanent exclusions.
Vooya also does not imply that moving code to WASM makes it faster; measure a
real workload against a real host baseline.

## Current state

Vooya is at `v0.1.0-alpha.10`. The Vite Rust-file path is the primary source
authoring route; Rspack and Webpack adapters are experimental. Source authors
install the Rust/WASM toolchain. A supported precompiled component product is
not published yet. Read [Project status](project/status.md) for the evidence
behind these statements.
