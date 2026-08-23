# Components

A Vooya component is a bounded Rust/WASM capability with a DOM surface. It is
the right unit when Rust needs to create or update a local subtree, while the
host application should continue to own the page, routing, surrounding state,
and design system.

## Contract

| Part | Direction | Purpose |
| --- | --- | --- |
| Props | Host → Rust | Initial values and declared updates |
| Events | Rust → Host | Narrow notifications delivered on the component host |
| Lifecycle | Host ↔ Rust | `mount`, prop updates, error reporting, and `dispose` |
| DOM and resources | Rust-owned below the host | Elements, listeners, and subscriptions released with the island |

The current Rust-file form is an ordinary `.rs` file with `#[voo::component]`,
an explicit `View`/`ViewElement` signature, and optional `#[voo::props]` and
`#[voo::events]` records. `rsx!` describes the Rust-owned subtree; it does not
replace the host application's renderer.

```rust
#[voo::component]
pub fn Greeting(
    view: &voo::View,
    props: GreetingProps,
) -> Result<voo::ViewElement, wasm_bindgen::JsValue> {
    voo::rsx!(view, <p>{format!("Hello, {}.", props.name)}</p>)
}
```

## Lifecycle and ownership

The host creates the mount element and forwards declared props. Rust creates
descendants and owned listeners, then handles updates until the host disposes
the island. Events use the non-bubbling `vooya-<name>` transport and are
decoded by the current Vue or React adapter. A component must release every
resource it creates; the host does not own Rust descendants.

Use a component for local rendering and interaction. Do not use one as a page
router, a global state container, or a replacement for ordinary host layout.
For state without a DOM subtree, use a [store](./store.md).

## Host consumption

The current first-party consumption paths import a generated `.rs` component as
an ordinary Vue or React component. These are the published alpha adapters and
their compatibility evidence; the component contract itself is intended to be
portable to other host renderers through explicit adapters.

See the [component boundary](./component-boundary.md), [Rust-file authoring
guide](../guide/rust-file-authoring.md), and [API reference](../reference/api.md)
for the generated declarations and ABI v1 value rules.
