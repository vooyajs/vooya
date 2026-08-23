# Concepts

Vooya is easiest to use when its boundary is explicit. The host application
still owns the page, router, application state, and surrounding DOM. Rust/WASM
owns a local island with a deliberately small interface.

## Core concepts

| Concept | What it answers |
| --- | --- |
| [Why Vooya?](../why-vooya.md) | What repeated integration problem does the layer address? |
| [Components](./component.md) | How does a Rust-owned DOM capability receive props and emit events? |
| [Stores](./store.md) | How does headless Rust state expose snapshots, actions, and disposal? |
| [Component boundary](./component-boundary.md) | Which side owns the host element, DOM subtree, state, and cleanup? |
| [Layer boundary and roadmap](../rfcs/0008-layer-boundary-and-roadmap.md) | Why is Vooya an integration layer instead of another UI framework? |
| [Events and lifecycle](../rfcs/0005-island-events-lifecycle-diagnostics.md) | How do props, events, errors, and disposal cross the boundary? |
| [ABI v1](../rfcs/0007-rust-file-authoring-and-abi-v1.md) | Which values are safe to move between Rust and JavaScript? |

## Current alpha scope

Vooya is currently a layer for integrating a Rust-owned capability where the
ownership and data boundary are worth the build complexity. The alpha does not
yet provide SSR, hydration, or a standalone Rust renderer. Those are possible
future layers to evaluate separately, not permanent non-goals. WASM is also not
automatically faster for ordinary DOM work; measure the real workload.

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

Start with the [component boundary](./component-boundary.md) before deciding
whether a feature belongs in Rust.
