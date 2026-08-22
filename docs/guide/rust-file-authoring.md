# Rust-file authoring

Rust-file authoring is the alpha path for components and stores. It uses
ordinary `.rs` files; `.voo.rs` is not part of the contract.

## Roles

An attribute declares a framework-facing role:

```rust
use wasm_bindgen::JsValue;

#[voo::component]
pub fn Counter(
    view: &voo::View,
    props: CounterProps,
) -> Result<voo::ViewElement, JsValue> {
    voo::rsx!(view, <button>"Counter"</button>)
}

#[voo::store]
impl Cart {
    #[voo::action]
    pub fn add(&mut self, quantity: u32) { /* ... */ }

    #[voo::snapshot]
    pub fn snapshot(&self) -> CartView { /* ... */ }
}
```

`#[voo::props]` and `#[voo::events]` describe the public contract associated
with a component in the same source file. A file may contain at most one of
each public role. Ordinary unmarked Rust files remain internal modules.

The compiler emits versioned schema records into the WASM custom section
`__voo_schema`. Build tooling reads those records to validate the contract,
generate declarations, and create framework bindings. Users do not write or
edit schema records.

The component record includes the authored function's return type. The
generated DOM wrapper currently requires the explicit signature above. It
exposes `mount`, an atomic `update_props`, and `dispose` exports; this check
happens at the build boundary rather than being silently guessed by the Vite
plugin.

## Component and store boundaries

Components and stores have different host contracts:

- a component owns a DOM subtree and receives `mount`, atomic prop updates,
  events, and `dispose` calls;
- a store owns an instance-scoped state machine and exposes a snapshot,
  subscriptions, actions, and disposal;
- Vue and React adapters consume the same Rust/WASM ABI but do not share a
  component lifecycle wrapper with stores.

The Vue adapter exposes the store contract through `useVooyaStore`:

```ts
const { snapshot, dispatch } = useVooyaStore(cartStore, {
  disposeOnUnmount: true,
});

dispatch("add", 1);
console.log(snapshot.value);
```

When a `.rs` file contains a `#[voo::store]`, importing that file from the
Vite/Vue graph exposes an async factory. The factory creates an independent
store instance and keeps the Rust ABI behind the generated module:

```ts
import createCartStore from "./Store.rs";

const cartStore = await createCartStore();
const { snapshot, dispatch } = useVooyaStore(cartStore, {
  disposeOnUnmount: true,
});
```

The generated module forwards `getSnapshot`, `subscribe`, each `#[voo::action]`,
and `dispose`. It does not turn a store into a Vue component or create a
global singleton.

Runtime prop metadata and generated declarations use one shared ABI mapping:
64/128-bit integers are `bigint`, `Option<T>` is nullable, vectors and tuples
are arrays, and string-keyed maps and named records are objects. Unsupported
Rust public types fail at the build boundary instead of receiving an
inaccurate framework prop constructor.

The composable mirrors `getSnapshot()` after each `subscribe()` notification;
it does not deep-proxy the Rust state or invent a second notification queue.
`disposeOnUnmount` is explicit because a store may be shared by multiple Vue
components. The generated TypeScript declaration describes the same
`getSnapshot/subscribe/action/dispose` boundary.

The initial Vite integration targets Vue 3.5+ and Vite 7/8. Vue 3.6 Vapor is
an explicit compatibility target, but remains experimental until a dedicated
Vapor fixture passes the same mount, update, event, and disposal checks.

## Generated files

Vooya owns generated Rust roots, WASM output, and TypeScript declarations under
`.vooya/`. Source directories are not polluted with generated `.d.ts` files.
The generated Cargo application depends on the public `vooya` authoring crate,
so Rust files can write `use vooya as voo;`; users do not add a Cargo manifest
or maintain the generated crate root.
