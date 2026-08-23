# Concepts

Vooya is easiest to use when its boundary is explicit. The host application
still owns the page, router, application state, and surrounding DOM. Rust/WASM
owns a local island with a deliberately small interface.

## Core concepts

| Concept | What it answers |
| --- | --- |
| [Component boundary](./component-boundary) | Which side owns the host element, DOM subtree, state, and cleanup? |
| [Layer boundary and roadmap](../rfcs/0008-layer-boundary-and-roadmap) | Why is Vooya an integration layer instead of another UI framework? |
| [Events and lifecycle](../rfcs/0005-island-events-lifecycle-diagnostics) | How do props, events, errors, and disposal cross the boundary? |
| [ABI v1](../rfcs/0007-rust-file-authoring-and-abi-v1) | Which values are safe to move between Rust and JavaScript? |

## What Vooya is not

Vooya is not a replacement for Vue or React, a universal Rust renderer, a
server-side rendering framework, or a claim that WASM makes ordinary DOM work
automatically faster. It is a layer for integrating a Rust-owned capability
where the ownership and data boundary are worth the build complexity.

## A useful mental model

```text
host application
  ├─ page tree, router, business state, ordinary DOM
  └─ framework adapter
       └─ host element
            └─ Vooya island
                 ├─ Rust state and computation
                 ├─ owned DOM/listeners/resources
                 └─ ABI v1 props, events, lifecycle
```

Start with the [component boundary](./component-boundary) before deciding
whether a feature belongs in Rust.
