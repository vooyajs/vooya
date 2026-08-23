---
layout: home

hero:
  name: Vooya
  text: WASM integration for existing Web applications
  tagline: Bring browser-compatible Rust capabilities into Vue, React, and other host applications without replacing the application framework.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Read the layer boundary
      link: /rfcs/0008-layer-boundary-and-roadmap

features:
  - title: Keep your host application
    details: Vue or React keeps the page tree, routing, application state, and surrounding DOM.
  - title: Own one bounded capability
    details: Rust owns a component island with typed props, events, lifecycle, and disposal.
  - title: Use the Web ecosystem
    details: Vooya connects Rust and WebAssembly to existing bundlers and framework adapters.
---

## Start with the integration layer

Vooya is not a replacement for Vue, React, or a full Rust application
framework. It standardizes the build and runtime boundary needed to reuse
browser-compatible Rust code inside an existing Web application.

Read the [getting started guide](guide/getting-started.md), then check the
[compatibility matrix](project/compatibility.md) before choosing a bundler.

## Is Vooya a fit?

Use Vooya when a bounded capability benefits from Rust's ecosystem, predictable
ownership, or computation that is awkward to keep in the host language. Canvas,
WebGL, editors, parsers, data-heavy widgets, and local stores are reasonable
starting points.

Keep ordinary page layout, routing, forms, and application state in Vue or
React. Vooya is not a general Rust renderer, an SSR framework, or a promise
that moving code to WASM makes it faster.

## Current state

Vooya is at `v0.1.0-alpha.10`. The Vite Rust-file path is the primary source
authoring route; Rspack and Webpack adapters are experimental. Source authors
install the Rust/WASM toolchain. A supported precompiled component product is
not published yet. Read [Project status](project/status.md) for the evidence
behind these statements.
