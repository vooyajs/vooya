# Stores

A Vooya store is a headless Rust/WASM state capability. It owns an
instance-scoped state machine and exposes a snapshot, subscriptions, declared
actions, and disposal. It does not own a DOM subtree.

## Contract

| Part | Direction | Purpose |
| --- | --- | --- |
| Snapshot | Rust → Host | Read the current serializable state |
| Subscription | Rust → Host | Notify the adapter when the snapshot changes |
| Action | Host → Rust | Run a declared synchronous state transition |
| Dispose | Host → Rust | Release listeners and other owned resources |

Declare a store with `#[voo::store]`, mark public transitions with
`#[voo::action]`, and expose its state with `#[voo::snapshot]`. The current ABI
creates an instance from Rust's `Default` implementation; constructor props and
async actions are not part of ABI v1.

## Ownership

Stores are instance-scoped by default. A component or host service may own one
store, or several consumers may share one store if a separate owner controls
its lifetime. Vue's `disposeOnUnmount` is explicit for this reason. React's
generated hook disposes the instance it created when its owning hook unmounts.

Do not assume that a store is a global singleton. If a store is shared, choose
an owner and call `dispose` when that owner is finished.

## Host consumption

In Vue, `useVooyaStore` mirrors the latest snapshot and provides explicit action
dispatch:

```ts
const { snapshot, dispatch } = useVooyaStore(createCartStore(), {
  disposeOnUnmount: true,
});

dispatch("add", 1);
```

In React, the generated hook follows `useSyncExternalStore`, so React receives
the same snapshot/subscription contract rather than a second state model:

```tsx
const { state, add } = useCart();
add(1);
```

Snapshots, action arguments, and return values use the shared ABI v1 mapping.
Keep values owned and schema-valid; async actions, borrowed values, arbitrary
generics, and zero-copy typed-array transport are outside the current boundary.

Choose a store for reusable state or computation without DOM. Choose a
[component](./component.md) when Rust also needs to own a local rendered tree;
they can be used together without sharing lifecycle implicitly.

See the [Rust-file authoring guide](../guide/rust-file-authoring.md) and [API
reference](../reference/api.md) for generated declarations and adapter options.
