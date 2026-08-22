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

Styles are declared separately and may be repeated on a component:

```rust
#[voo::component]
#[voo::style("./Counter.css", scoped)]
fn Counter(/* ... */) { /* ... */ }
```

The bundler owns CSS loading, preprocessing, and HMR. `scoped` adds the same
component scope marker used by the host adapters; CSS is never embedded in
WASM.

Inside `rsx!`, an expression of the form `{count.get()}` where `count` is a
`Signal<T>` creates a text or attribute binding. The binding updates
synchronously and its subscription is released when the owning root is
removed:

```rust
let count = voo::signal(0u32);
let root = voo::rsx!(view, <span data-count={count.get()}>{count.get()}</span>)?;
```

Multiple synchronous writes can share one notification boundary with
`voo::batch(|| { ... })`; subscribers run once after the outermost batch.
If an effect writes a signal that synchronously re-enters the same effect, the
runtime suppresses that re-entrant invocation instead of recursing indefinitely.
`voo::tracked_effect` is available for code that wants automatic dependency
collection: each `Signal::get()` during the callback is subscribed, and the
next run replaces the previous dependency set. The current `rsx!` macro still
uses explicit bindings, so this is a runtime API rather than implicit template
syntax.

Event listeners can use the same owned-root syntax, for example
`on-click={move |_| count.set(1)}`. The listener is removed with the root.
The runtime also exposes `insert_before`, `remove_child`, and `replace_child`
for future branch and keyed-list reconciliation; these APIs preserve the
child's cleanup ownership while moving or replacing DOM roots.
`KeyedChildren<K>` builds on those primitives to reuse roots by stable key and
release roots whose keys disappear. Duplicate keys are rejected.
This is the first explicit reactive/event binding layer; automatic dependency
inference, keyed lists, and conditional branch compilation remain under the
`rsx!` runtime workstream.

Rust-to-host events use an events schema plus the host-bound `View::emit` API:

```rust
#[voo::events]
pub trait CounterEvents {
    fn selected(value: u32);
}

// Inside the component function:
view.emit("selected", wasm_bindgen::JsValue::from_f64(value as f64))?;
```

`View::emit` dispatches the non-bubbling `vooya-selected` CustomEvent on the
framework host. Vue and React adapters decode the declared event parameters
and deliver them to the framework callback. The v1 API accepts a `JsValue` at
this call site; users should encode values with the shared owned ABI helpers.

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

React imports the same `.rs` store through a generated hook. The hook creates
one instance for its mounted lifetime and subscribes through
`useSyncExternalStore`:

```tsx
import Counter from "./Counter.rs";
import { useCart } from "./Store.rs";

function App() {
  const { state, add } = useCart();
  return <Counter count={state?.count ?? 0} onClick={() => add(1)} />;
}
```

In ABI v1, a store is created from Rust's `Default` implementation and does not
accept constructor props. The optional argument to `useCart` is the adapter
options object (`onError` and `onNotify`); state that must change after
construction belongs in an explicit `#[voo::action]` method.

Actions are synchronous. A unit-returning action is exposed as a void host
operation; an action returning `Result<(), JsValue>` propagates its error to
the generated binding. Failed actions do not roll back mutations made before
the error, and async actions are outside ABI v1.

The generated `.d.rs.ts` declaration mirrors both sides of the module. For a
React store it includes the factory, default export, snapshot/store types, and
the generated hook. In the current ABI-v1 alpha, a snapshot that refers to a
user-defined `ToJs` struct is declared as an object-shaped fallback until
standalone schema records for those structs are added:

```ts
import type { VooyaStoreOptions } from "@vooya/react";

export declare function createCartStore(): Promise<Cart>;
export default createCartStore;
export declare function useCart(options?: VooyaStoreOptions): {
  state: CartSnapshot | undefined;
  add(...args: [number]): void;
};
```

Snapshots returned by the generated Rust store keep JavaScript identity until
the Rust snapshot actually changes. This stable identity is required by
React's `useSyncExternalStore` contract.

## ABI v1 value boundary

Props, event payloads, action arguments, and snapshots use one shared mapping:

| Rust value | TypeScript value | Notes |
| --- | --- | --- |
| `i8`–`u32`, `isize`, `usize`, `f32`, `f64` | `number` | Integers are finite, integral, and range checked. |
| `i64`, `u64`, `i128`, `u128` | `bigint` | Exact conversion; never pass these through `number`. |
| `bool`, `String` | `boolean`, `string` | Owned values only. |
| `Vec<T>` | `T[]` | Every element must be supported. |
| `Option<T>` | `T \| null` | `undefined` and `null` input decode as `None`; output is `null`. |
| `(A, B, ...)` | `[A, B, ...]` | Fixed-length tuples. |
| `HashMap<String, T>` / `BTreeMap<String, T>` | `Record<string, T>` | Only string keys are supported. |

Borrowed values, recursive public types, arbitrary generics, non-string-key
maps, and zero-copy `TypedArray` transport are outside ABI v1. Keep those
values behind an owned Rust boundary or encode them using a supported fallback;
the build must reject them rather than silently coerce them.

The composable mirrors `getSnapshot()` after each `subscribe()` notification;
it does not deep-proxy the Rust state or invent a second notification queue.
`disposeOnUnmount` is explicit because a store may be shared by multiple Vue
components. The generated TypeScript declaration describes the same
`getSnapshot/subscribe/action/dispose` boundary.

The initial Vite integration targets Vue 3.5+, React 19+, and Vite 7/8. Vue 3.6 Vapor is
an explicit compatibility target, but remains experimental until a dedicated
Vapor fixture passes the same mount, update, event, and disposal checks.

## Generated files

Vooya owns generated Rust roots, WASM output, and TypeScript declarations under
`.vooya/`. Source directories are not polluted with generated `.d.ts` files.
The generated Cargo application depends on the public `vooya` authoring crate,
so Rust files can write `use vooya as voo;`; users do not add a Cargo manifest
or maintain the generated crate root.
The generated root is reconciled on each build, so removed or renamed `.rs`
files cannot remain as stale modules in the application crate.
