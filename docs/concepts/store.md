# Store

A `Store` is a headless Rust/WASM capability. It owns an instance-scoped state
machine and exposes a snapshot, subscriptions, declared actions, and disposal.
It does not own a DOM subtree; the host application remains responsible for
rendering the snapshot.

## Basic usage

Declare the public role and keep the Rust implementation in an ordinary `.rs`
module:

```rust
#[voo::store]
impl Cart {
    #[voo::snapshot]
    pub fn snapshot(&self) -> CartSnapshot { /* ... */ }

    #[voo::action]
    pub fn add(&mut self, quantity: u32) { /* ... */ }
}
```

The generated module exposes an independent store instance and a framework
convenience hook with the same public shape in Vue and React. For a `Cart` store,
the generated exports are `createCartStore()` and `useCart()`:

```vue
<script setup lang="ts">
import { useCart } from "./Cart.rs";

const { state, add } = useCart();
</script>

<template>
  <button type="button" @click="add(1)">Store {{ state?.count ?? 0 }}</button>
</template>
```

```tsx
import { useCart } from "./Cart.rs";

export function CartButton() {
  const { state, add } = useCart();
  return <button onClick={() => add(1)}>Store {state?.count ?? 0}</button>;
}
```

The hook name follows the Rust Store type, not the file name: `ShoppingCart` generates
`useShoppingCart`. Vue exposes `state` as a reactive `Ref` (automatically unwrapped in
templates), while React exposes the current snapshot value. The public fields and action
shape are otherwise the same.

The lower-level `useVooyaStore` exports remain available from the framework adapters for
custom integrations, shared instances, and adapter authors. They are not the primary API
for ordinary application code.

The current ABI creates state from Rust's `Default` implementation. Constructor
props and async actions are outside ABI v1. Snapshot fields, action arguments,
and return values must use the shared owned ABI mapping. See the [API
reference](../reference/api.md) for adapter options and the [Rust authoring
guide](../guide/rust-file-authoring.md) for the complete role syntax.

## Contract

| Part | Direction | Purpose | Current boundary |
| --- | --- | --- | --- |
| Snapshot | Rust → Host | Read current serializable state | Cached output is published through the store subscription |
| Subscription | Rust → Host | Notify the adapter after a snapshot change | Every subscription is disposable |
| Action | Host → Rust | Run a declared synchronous state transition | Actions are explicit; async actions are not ABI v1 |
| Dispose | Host → Rust | Release listeners and owned resources | The owner must call it for shared instances |

Stores are instance-scoped by default. A component or host service may own one
store, or several consumers may share one when a separate owner controls its
lifetime. Generated `useName()` hooks own and dispose the instance they create;
the lower-level Vue `disposeOnUnmount` option remains explicit for custom
integrations. A store is not a global singleton by implication.

## Why signals?

Signals are the Rust runtime primitive for a value that can change and notify
owned work. They are useful inside a Store for local state and derived
computation, while the public Store boundary stays deliberately smaller:
snapshot, subscription, action, and dispose.

| Runtime tool | What it does today | Why it matters for a Store |
| --- | --- | --- |
| `Signal<T>` | Synchronous `get`, `set`, and `update` | Keeps Rust-owned state explicit and type-checked |
| `effect` | Runs an explicitly subscribed callback | Makes the notification relationship visible |
| `tracked_effect` | Collects signals read during a callback and replaces stale subscriptions on rerun | Supports dynamic derived work without asking the author to maintain every subscription |
| `batch` | Coalesces synchronous writes until the outer transaction completes | Prevents observers from seeing intermediate combinations of one logical update |
| `SignalSubscription` | Unsubscribes on `drop` | Gives branches, components, and stores deterministic cleanup |

This split follows the discussion in [Issue #60](https://github.com/vooyajs/vooya/issues/60)
and [RFC 0002](../rfcs/0002-reactive-component-model.md): static structure can
be known by a compiler, but arbitrary Rust helpers and runtime branches need
runtime dependency tracking. The current runtime provides explicit bindings and
opt-in tracking. It does not promise that every Store action automatically
becomes a fine-grained UI update, and it does not make a Store a second Vue or
React renderer.

## When to choose Store

Choose a `Store` when Rust should own reusable state or computation without
owning markup: parsing state, a data model, validation, or a domain operation
shared by several host views. Choose a [Component](./component.md) when Rust
also needs to create or update a local rendered tree. They can be composed, but
they do not implicitly share ownership or lifecycle.
