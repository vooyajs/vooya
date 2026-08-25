# Why Vooya?

An existing traditional Web application—often built with Vue, React, or
another JavaScript/TypeScript stack—may have one capability that would be better
implemented in Rust: a parser, editor core, Canvas/WebGL surface, data-heavy
control, or stateful logic backed by an existing Rust crate. The team may want
that capability without rewriting the page tree, router, business state, design
system, and surrounding DOM.

Without a shared integration layer, every project rebuilds the same glue:
WASM loading, framework adapters, value conversion, lifecycle ownership,
events, declarations, error reporting, and bundler assets. Vooya was created to
make that boundary repeatable.

## Keep JavaScript. Move only the expensive part.

Vooya's name comes from a voyage to an island: the JavaScript application stays
the familiar surface, while one focused workload travels to the runtime best
suited to handle it. This is an incremental integration model, not a request to
rewrite a product in Rust. The same idea appears across the Vooya organization:
for example, Rush-FS keeps a Node-style JavaScript boundary while moving
filesystem work to native Rust. Vooya applies that boundary-first thinking to
browser WASM islands.

The project is maintained as a set of focused tools and experiments around this
boundary. The repository contains the compiler, adapters, examples, and
verification fixtures; it is not a replacement for the host application's
framework, router, or design system.

## What Vooya standardizes

Vooya connects a host application to one bounded Rust/WASM island. The host
keeps the application shell; Vooya coordinates the source build, ABI, typed
props and events, stores, lifecycle, disposal, diagnostics, and bundler output.
That is why Vooya is an **integration layer**, not another UI framework.

The current alpha is host-first: the existing Web application's renderer owns
the host element and application; Rust owns the local subtree and resources
below it. Vue, React, Solid, and Svelte are the first-party adapters today, not
the architectural limit. Vue and React are supported; Solid and Svelte are
experimental with current evidence on the Vite 7 Rust-file path.

## What you gain by choosing Vooya

Compared with a one-off `wasm-bindgen` / `wasm-pack` integration, Vooya gives
the project a repeatable contract instead of another hand-maintained wrapper:

- one authoring model for Rust components and stores;
- generated props, events, lifecycle, disposal, declarations, and diagnostics;
- a consistent host adapter boundary instead of framework-specific glue in every
  component; and
- a path for bundler plugins, validation, development rebuilds, and compatibility
  fixtures to evolve together.

This does not replace `wasm-bindgen` or `wasm-pack`; it standardizes the
application integration work that those lower-level tools intentionally leave to
each project. In that sense, Vooya is also a reusable production pattern for
custom WASM wrappers, not just another wrapper for one library.

## How is Vooya different from nearby approaches?

| Approach | Application ownership | Rust toolchain responsibility | What it solves | Vooya relationship / boundary |
| --- | --- | --- | --- | --- |
| Hand-written `wasm-bindgen` / `wasm-pack` | The team decides the boundary | The team wires Cargo, WASM, bindings, and assets | Compilation and basic JavaScript bindings | Vooya builds on these foundations and standardizes the adapter, ABI, lifecycle, events, declarations, and bundler glue |
| Yew, Dioxus, Leptos and similar Rust-led UI frameworks | Rust commonly owns the application renderer or tree | Rust is the primary application toolchain | A Rust-first way to build UI | Rust-led UI and Vooya's host-first Web integration have different design targets |
| Web Components | The browser element is the cross-framework boundary | Web Components alone do not choose a Rust/WASM build | Encapsulation and framework-neutral consumption | A possible future consumption boundary; Vooya does not claim a Web Component adapter today |
| Custom WASM wrapper | Each team owns its own contract and glue | Each team assembles the toolchain | Any bespoke integration can work | Vooya turns recurring build, ABI, lifecycle, and bundler conventions into a reusable path |
| Rust core plus multi-framework wrappers | Usually one product owns the application decision | The product team maintains its Rust build and wrappers | A real Rust core can serve several framework packages | Public examples such as dotLottie show the demand; Vooya's candidate value is making that integration process more general |

The comparison is about design targets, not a ranking. Each approach can be the
right choice for a different ownership model.

## When is Vooya a good fit?

- A traditional Web application that wants to add a Rust/WASM capability without
  making every team maintain its own loading, ABI, lifecycle, and bundler glue.
- An editor, parser, timeline, Canvas/WebGL surface, data-heavy local widget, or
  another capability that can expose a clear typed contract.
- A project that wants to reuse a browser-compatible Rust crate while keeping its
  existing renderer, routing, state, and design system.

## Current scope and future layers

The alpha focuses on client-side, bounded islands in a traditional Web host.
Ordinary layout, routing, forms, design-system components, and global business
state remain in the host while those capabilities are being integrated.

SSR, hydration, and a standalone Rust renderer are not part of the current alpha
path; they remain possible future layers in the roadmap rather than permanent
non-goals. Vooya also does not imply that moving code to WASM makes it faster:
measure a real workload against a real host baseline.

## Common questions

### How do I use Rust/WASM in an existing Web application without rewriting it?

Keep the existing renderer as the host, install a matching adapter and bundler
plugin, then import an ordinary `.rs` component. The current first-party Vite
path covers Vue, React, Solid, and Svelte; another framework needs its own
adapter and compatibility evidence. Solid and Svelte are experimental Vite 7
evidence, not general bundler or SSR claims.
Start with the [quickstart](guide/getting-started.md) and inspect the
[component boundary](concepts/component-boundary.md).

### Can Vooya work with another Web framework?

The architecture is framework-agnostic: Vooya is the integration layer between a
traditional Web host and a bounded WASM island. The current source tree has
first-party Vue, React, Solid, and Svelte adapters; Solid and Svelte remain
experimental. Other frameworks are not implicitly supported; each needs an
adapter, a documented contract, and independent compatibility evidence.

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
