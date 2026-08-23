# Why Vooya?

An existing Vue or React application may have one capability that would be
better implemented in Rust: a parser, editor core, Canvas/WebGL surface, data-
heavy control, or stateful logic backed by an existing Rust crate. The team may
want that capability without rewriting the page tree, router, business state,
design system, and surrounding DOM.

Without a shared integration layer, every project rebuilds the same glue:
WASM loading, framework adapters, value conversion, lifecycle ownership,
events, declarations, error reporting, and bundler assets. Vooya was created to
make that boundary repeatable.

## What Vooya standardizes

Vooya connects a host application to one bounded Rust/WASM island. The host
keeps the application shell; Vooya coordinates the source build, ABI, typed
props and events, stores, lifecycle, disposal, diagnostics, and bundler output.
That is why Vooya is an **integration layer**, not another UI framework.

The current alpha is host-first: Vue or React owns the host element and the
application; Rust owns the local subtree and resources below it.

## How is Vooya different from nearby approaches?

| Approach | Application ownership | Rust toolchain responsibility | What it solves | Vooya relationship / boundary |
| --- | --- | --- | --- | --- |
| Hand-written `wasm-bindgen` / `wasm-pack` | The team decides the boundary | The team wires Cargo, WASM, bindings, and assets | Compilation and basic JavaScript bindings | Vooya builds on these foundations and standardizes the adapter, ABI, lifecycle, events, declarations, and bundler glue |
| Yew, Dioxus, Leptos and similar Rust-led UI frameworks | Rust commonly owns the application renderer or tree | Rust is the primary application toolchain | A Rust-first way to build UI | Useful when Rust should lead the application; Vooya is for incremental islands inside an existing Vue/React host |
| Web Components | The browser element is the cross-framework boundary | Web Components alone do not choose a Rust/WASM build | Encapsulation and framework-neutral consumption | A possible future consumption boundary; Vooya does not claim a Web Component adapter today |
| Custom WASM wrapper | Each team owns its own contract and glue | Each team assembles the toolchain | Any bespoke integration can work | Vooya turns recurring build, ABI, lifecycle, and bundler conventions into a reusable path |
| Rust core plus multi-framework wrappers | Usually one product owns the application decision | The product team maintains its Rust build and wrappers | A real Rust core can serve several framework packages | Public examples such as dotLottie show the demand; Vooya's candidate value is making that integration process more general |

The comparison is about design targets, not a ranking. Each approach can be the
right choice for a different ownership model.

## When is Vooya a good fit?

- An editor, parser, timeline, Canvas/WebGL surface, or data-heavy local widget.
- A bounded capability that can expose a small typed props/events/store contract.
- A project that wants to reuse a browser-compatible Rust crate without handing
  the whole application to a Rust renderer.

## When is it not?

Keep ordinary layout, routing, forms, design-system components, and global
business state in the host framework. Vooya is also not a general SSR or
hydration solution, a standalone Rust renderer, or a reason to move code merely
to claim that WASM is faster.

## Common questions

### How do I use Rust/WASM in a Vue or React project without rewriting it?

Keep Vue or React as the host, install the matching adapter and bundler plugin,
then import an ordinary `.rs` component. Start with the [quickstart](guide/getting-started.md)
and inspect the [component boundary](concepts/component-boundary.md).

### What is the difference between `wasm-bindgen` and Vooya?

`wasm-bindgen` and `wasm-pack` provide foundational compilation and bindings.
Vooya adds a convention for the repeated application-level concerns around
those bindings: host adapters, ABI validation, lifecycle, events, declarations,
diagnostics, and bundler integration.

### Is Vooya a framework?

No. It is a WASM integration layer. The host framework still owns the page and
application; Vooya owns a bounded Rust capability island.

## Next step

Read the [layer mental model](concepts/component-boundary.md), run the
[quickstart](guide/getting-started.md), and then check the
[toolchain reference](reference/tooling.md) and [compatibility matrix](project/compatibility.md).
The current Vite path is primary; Rspack and Webpack remain experimental, and
precompiled artifacts are not yet a published consumer product.
