# Component

A `Component` is a bounded Rust/WASM capability with a DOM surface. It lets
Rust own one local subtree while the traditional Web host keeps ownership of
the page, router, surrounding state, and design system.

## Basic usage

Author a component in an ordinary `.rs` file with an explicit role. `rsx!`
describes only the Rust-owned subtree:

```rust
#[voo::component]
pub fn Greeting(
    view: &voo::View,
    props: GreetingProps,
) -> Result<voo::ViewElement, wasm_bindgen::JsValue> {
    voo::rsx!(view, <p>{format!("Hello, {}.", props.name)}</p>)
}
```

Optional `#[voo::props]` and `#[voo::events]` records define the host-facing
contract. The current Vite path generates ordinary Vue, React, Solid, or Svelte
components from the Rust module:

```tsx
import Greeting from "./Greeting.rs";

export function App() {
  return <Greeting name="Ada" onSelected={(value) => console.log(value)} />;
}
```

The same generated contract is available through each adapter; only the
host-framework syntax and lifecycle integration change. See the [Rust authoring guide](../guide/rust-file-authoring.md)
and [API reference](../reference/api.md) for declaration and ABI details.

## Contract and ownership

| Part | Direction | Purpose | Current boundary |
| --- | --- | --- | --- |
| Props | Host → Rust | Initial values and declared updates | Top-level props are read-only Rust signals; updates arrive as one validated patch |
| Events | Rust → Host | Narrow notifications from the island | Current Vue/React/Solid/Svelte adapters use non-bubbling `vooya-<name>` events |
| Lifecycle | Host ↔ Rust | Mount, prop updates, errors, and disposal | The host owns the mount element and invokes `dispose` |
| DOM and resources | Rust-owned below the host element | Local elements, listeners, and subscriptions | Every resource created by the island must have an owning cleanup scope |

Rust creates descendants and owned listeners after the host supplies a mount
element. On unmount, the host drops the WASM handle and the component releases
its descendants, subscriptions, and listeners. The host does not own the Rust
subtree, and Rust does not own the surrounding application.

The toolchain generates one framework-neutral Component bridge containing the
component contract and asynchronous binding loader. Vue, React, Solid, and Svelte
adapters turn that bridge into their native component and owner lifecycle. The
bridge is generated implementation output, not a stable IR that application
authors should hand-write or depend on directly.

## Why a Component?

Not every Rust capability needs to render. A `Store` is the better boundary when
the host should render the UI and Rust only provides state or computation. A
`Component` is useful when the local capability has a meaningful rendering
surface that would otherwise require repeated JS/WASM glue: an editor surface,
parser result view, Canvas-backed control, or data-dense interaction region.

The component boundary packages the repeated integration work into a contract:
typed props and events, lifecycle, ABI conversion, resource cleanup, and a
bundler-generated host module. It is still a bounded island, not a component
library or a replacement for ordinary host layout.

## Why let Rust participate in rendering?

The motivation is ownership, not a claim that WASM makes every render faster.
Some local capabilities already have valuable Rust logic, state, or crates. If
that capability must continuously coordinate a DOM subtree, keeping its local
rendering and cleanup next to the Rust state can avoid a second hand-written
wrapper layer. The surrounding Web application can still use its existing
framework and design system.

Vooya therefore follows the island boundary recorded in [RFC
0001](../rfcs/0001-component-islands.md) and the host-first model in [RFC
0008](../rfcs/0008-layer-boundary-and-roadmap.md): the host owns the page and
mount point; the Rust `Component` owns only its descendants and declared
resources. `rsx!` is currently a DOM tree syntax, not a universal renderer or
an application-wide Rust UI framework. Canvas, WebGL, native renderers, SSR,
and hydration need separate contracts and are not implied by this page.

## When not to choose Component

Do not use a `Component` for page routing, global business state, ordinary
layout, or a full application renderer. Do not choose it only to advertise
WASM. Measure the actual workload, and keep the boundary in the host when the
integration cost is greater than the local Rust capability it enables.

See the [component boundary](./component-boundary.md) for the ownership table
and the [Store](./store.md) concept for the headless alternative.
