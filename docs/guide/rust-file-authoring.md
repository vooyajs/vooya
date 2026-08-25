# Rust-file authoring

Rust-file authoring is the alpha path for components and stores. It uses
ordinary `.rs` files; `.voo.rs` is not part of the contract.

## Vooya attribute markers

Vooya attribute macros do not introduce a second template language. They mark
ordinary Rust items as a Component or Store and make the compiler emit a
versioned schema. The bundler uses that schema to generate WASM bindings,
framework modules, and TypeScript declarations. Unmarked Rust files remain
ordinary internal modules.

| Marker | Applies to | Purpose | Required companion |
| --- | --- | --- | --- |
| `#[voo::component]` | Function | Declare a Rust-owned local DOM Component | `(&voo::View, Props) -> Result<voo::ViewElement, JsValue>` |
| `#[voo::props]` | Struct | Declare the host-facing props schema | Usually `#[derive(voo::FromJs)]` |
| `#[voo::events]` | Trait | Declare event names and parameters sent to the host | Emit with `View::emit` inside the Component |
| `#[voo::store]` | `impl` block | Declare a DOM-free instance-scoped Store | Exactly one `#[voo::snapshot]` method |
| `#[voo::action]` | Store method | Expose a synchronous state transition | Parameters must use ABI v1 values |
| `#[voo::snapshot]` | Store method | Define the state shape read by the host | Return type implements `ToJs + PartialEq` |
| `#[voo::style("./x.css"[, scoped])]` | Component | Declare a bundler-managed stylesheet | Repeatable; `scoped` is optional |

Markers accept schema metadata: `id = "..."` overrides the default schema id and
`group = "..."` overrides the source group. Most applications can omit both;
the defaults come from the item name and source path.

### Component marker composition

```rust
use wasm_bindgen::JsValue;
use vooya as voo;

#[voo::props]
#[derive(voo::FromJs)]
pub struct GreetingProps {
    pub name: String,
}

#[voo::events]
pub trait GreetingEvents {
    fn selected(value: u32);
}

#[voo::component]
#[voo::style("./Greeting.css", scoped)]
pub fn Greeting(
    view: &voo::View,
    props: GreetingProps,
) -> Result<voo::ViewElement, JsValue> {
    Ok(voo::rsx!(view, <p>{format!("Hello, {}", props.name)}</p>)?)
}
```

`FromJs` and `ToJs` are derive macros rather than attributes: `FromJs` decodes
host ABI values into Rust types, while `ToJs` encodes Rust values for the host.
`#[voo::events]` declares the event schema; the actual notification uses
`view.emit("selected", payload)` and remains a non-bubbling event on the
Component host.

### Store marker composition

```rust
#[derive(voo::ToJs, PartialEq, Clone)]
pub struct CartSnapshot {
    pub count: u32,
}

#[derive(Default)]
pub struct Cart {
    count: u32,
}

#[voo::store]
impl Cart {
    #[voo::action]
    pub fn add(&mut self, amount: u32) {
        self.count += amount;
    }

    #[voo::snapshot]
    pub fn snapshot(&self) -> CartSnapshot {
        CartSnapshot { count: self.count }
    }
}
```

`#[voo::store]` does not create DOM or turn the Store into a global singleton.
The bundler generates `createCartStore()` and a `useCart()` entry with the same
names and fields for the first-party adapters. Its `state` container remains
framework-native; see the [Store concept](../concepts/store.md).

The earlier `.voo` format combined a manifest, Rust, and CSS in one custom file.
We moved away from it because it hid Rust from normal tooling, required a
separate parser and formatter, and made the source contract diverge from the Rust
compiler. Keeping ordinary `.rs` files makes rust-analyzer, Cargo diagnostics,
schema derives, and generated bindings follow one source of truth. The old
format remains only as transitional implementation history and is not a
new-project authoring choice.

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
for branch and keyed-list reconciliation; these APIs preserve the child's
cleanup ownership while moving or replacing DOM roots.
`KeyedChildren<K>` builds on those primitives to reuse roots by stable key and
release roots whose keys disappear. Duplicate keys are rejected.
This is the first explicit reactive/event binding layer; the `rsx!` loop form
`for item in items.get() { <Row key={item.id} /> }` now provides keyed list
identity. Conditional branches use ordinary Rust-style `if`/`else` blocks:
`if visible.get() { <Shown /> } else { <Hidden /> }`; the branch root is
replaced at a comment anchor and its owned resources are released.

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
framework host. Vue, React, Solid, and Svelte adapters decode the declared event
parameters and deliver them to the framework callback. The v1 API accepts a `JsValue` at
this call site; users should encode values with the shared owned ABI helpers.

## Component and store boundaries

Components and stores have different host contracts:

- a component owns a DOM subtree and receives `mount`, atomic prop updates,
  events, and `dispose` calls;
- a store owns an instance-scoped state machine and exposes a snapshot,
  subscriptions, actions, and disposal;
- Vue, React, Solid, and Svelte adapters consume the same Rust/WASM ABI but do not share a
  component lifecycle wrapper with stores.

When a `.rs` file contains a `#[voo::store]`, the first-party adapters expose
the same generated names and fields. A `Cart` Store generates `useCart()`
alongside the framework-neutral factory:

```vue
<script setup lang="ts">
import { useCart } from "./Store.rs";

const { state, add } = useCart();
</script>

<template>
  <button type="button" @click="add(1)">{{ state?.count ?? 0 }}</button>
</template>
```

```tsx
import { useCart } from "./Store.rs";

export function CartButton() {
  const { state, add } = useCart();
  return <button onClick={() => add(1)}>{state?.count ?? 0}</button>;
}
```

In Solid, `state` is an accessor rather than a snapshot value:

```tsx
const { state, add } = useCart();
return <button onClick={() => add(1)}>{state()?.count ?? 0}</button>;
```

In Svelte, `state` is a `Readable`; templates use `$state`:

```svelte
<script>
  const { state, add } = useCart();
</script>

<button onclick={() => add(1)}>{$state?.count ?? 0}</button>
```

The generated module also exports an async factory. Its name follows the Rust
Store type, not the file name: `Cart` generates `createCartStore`, while
`ShoppingCart` generates `createShoppingCartStore`:

```ts
import createCartStore from "./Store.rs";

const cartStore = await createCartStore();
cartStore.add(1);
console.log(cartStore.getSnapshot());
cartStore.dispose();
```

The generated `useName()` entry creates one instance for its framework owner
and disposes it on cleanup. The lower-level `useVooyaStore` export from the
selected adapter remains available for custom integrations, shared instances,
and adapter authors; it is not the ordinary application entry point.

In ABI v1, a store is created from Rust's `Default` implementation and does not
accept constructor props. The optional argument to `useCart` is the adapter
options object (for example `onError`); state that must change after
construction belongs in an explicit `#[voo::action]` method.

Actions are synchronous. A unit-returning action is exposed as a void host
operation; an action returning `Result<(), JsValue>` propagates its error to
the generated binding. Failed actions do not roll back mutations made before
the error, and async actions are outside ABI v1.

The generated `.d.rs.ts` declaration mirrors both sides of the module. It
includes the factory, default export, snapshot/store types, and the generated
hook for the selected framework. In the current ABI-v1 alpha, a snapshot that refers to a
user-defined `ToJs` struct is declared as an object-shaped fallback until
standalone schema records for those structs are added:

```ts
import type { Ref } from "vue";
import type { VooyaStoreOptions } from "@vooya/vue";

export declare function createCartStore(): Promise<CartStore>;
export default createCartStore;
export declare function useCart(options?: VooyaStoreOptions): {
  state: Readonly<Ref<CartSnapshot | undefined>>;
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

The initial Vite integration targets Vue 3.5+, React 19+, and Vite 7/8. Vue 3.6
Vapor is experimentally verified with the Vue runtime's `vaporInteropPlugin`.
Vapor setup remains a Vue concern: use `createVaporApp`, the Vapor runtime
build, and `vaporInteropPlugin` in the host application.

## Generated files

Vooya owns generated Rust roots, WASM output, and TypeScript declarations under
`.vooya/`. Source directories are not polluted with generated `.d.ts` files.
The generated Cargo application depends on the public `vooya` authoring crate,
so Rust files can write `use vooya as voo;`; users do not need to add a Cargo
manifest or maintain the generated crate root. An existing `Cargo.toml` is optional and,
when present, supplies dependency defaults to the generated crate.
The generated root is reconciled on each build, so removed or renamed `.rs`
files cannot remain as stale modules in the application crate.
