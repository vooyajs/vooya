# RFC 0007: Rust-file authoring and ABI v1

## Status

Accepted for alpha implementation. This RFC replaces the proposed `.voo.rs`
transition path with ordinary `.rs` files. It is an intentional breaking alpha
change; the old `.voo` format is not a compatibility layer for this path.

The decision discussion is #60; the store-model discussion is #61. Delivery is
tracked by #64, #75, #65, #66, #67, #68, #69, #70, #71, #72, #73, and #74.

## Authoring model

Vooya source is ordinary Rust. A file becomes visible to JavaScript only when
it declares an explicit framework role:

```rust
#[voo::component]
pub fn Counter(/* ... */) { /* rsx! tree */ }

#[voo::store]
impl Cart { /* actions and snapshot */ }
```

Unmarked files are ordinary internal Rust modules. Components and stores import
them through normal `mod` and `use`; they never generate JavaScript entries.
A future callable export is explicit (`#[voo::function]`), not inferred from a
public Rust function.

Framework roles use `#[voo::...]` attributes:

```rust
#[voo::props]
pub struct CounterProps { /* ... */ }

#[voo::events]
pub trait CounterEvents { /* ... */ }
```

Data capabilities use derives:

```rust
#[derive(FromJs, ToJs, PartialEq)]
pub struct CartView { /* ... */ }
```

The distinction is intentional. A role describes how Vooya exposes or schedules
an item; a derive implements behavior on data. `PartialEq` lets a store decide
whether a newly computed snapshot differs from its cached snapshot.

## Renderer and reactive boundary

The public macro is `rsx!`, not `view!`. Its name leaves room for a future
renderer-neutral tree language, but v1 implements DOM only. Canvas, Three.js,
native, and other renderers require separate contracts before they are
supported.

Rust owns the DOM subtree of a `#[voo::component]`. React or Vue may own its
surrounding UI. A `#[voo::store]` owns state, actions, and its snapshot while
the host framework owns rendering.

Each top-level prop is a read-only Rust signal; nested objects are owned values,
not implicit deep proxies. A host update is one atomic patch: decode and
validate every field, then commit once. Rust asks for a controlled prop change
by emitting an event.

Static structure is compiled by the macro. The runtime supports explicit
`Signal::get()` text/attribute bindings, opt-in tracked effects, and keyed list
reconciliation; all subscriptions and keyed roots are disposed with the owning
root. Signal writes are synchronous. Event handlers, actions, and prop
patches are transaction boundaries, so bindings commit without re-running the
whole component. Leaving a conditional branch disposes its nodes, listeners,
and subscriptions. Consumers must provide stable keys for list identity;
change detection does not infer them. Leaving a conditional branch still
requires an explicit branch owner.

```rust
rsx! {
    for item in items.get() {
        <TaskRow key={item.id} task={item} />
    }
}
```

## Rust-to-JavaScript ABI v1

All nested public fields must themselves be supported.

<!-- markdownlint-disable MD013 -->

| Rust | TypeScript wire type | Rule |
| --- | --- | --- |
| `i8`, `u8`, `i16`, `u16`, `i32`, `u32`, `isize`, `usize` | `number` | Integer and range checked. |
| `f32`, `f64` | `number` | Numeric validation as required by the Rust type. |
| `i64`, `u64`, `i128`, `u128` | `bigint` | Exact conversion and range check; never silently through `number`. |
| `bool` | `boolean` | Direct conversion. |
| `String` | `string` | Owned UTF-8 string. |
| `Vec<T>` | `T[]` | Elements use this table. |
| `Option<T>` | `T \| null` | Absent, `undefined`, and `null` input become `None`; output `None` is `null`. |
| `(A, B, ...)` | `[A, B, ...]` | Fixed-length tuple. |
| `BTreeMap<String, T>` / `HashMap<String, T>` | `Record<string, T>` | String keys only. |
| named structs/enums | generated object/union | Supported only when their contents are supported. |

<!-- markdownlint-restore -->

Recursive public types, arbitrary generic ABI, non-string maps, borrowed
values, zero-copy TypedArray transport, and custom `undefined` semantics are
not ABI v1. The compiler rejects them at the public boundary and explains the
owned-data fallback; it must not emit inaccurate TypeScript.

## Build, schema, and styles

Cargo needs a crate root, but application users do not maintain generated
`lib.rs`. By default Vooya generates the sole crate root at
`.vooya/build/src/lib.rs` and owns its module graph. A user-authored root is
used only when `rust.entry` is explicitly configured; Vooya never changes mode
merely because `src/lib.rs` happens to exist. Edits reuse the module graph;
add/remove/move regenerates it.

Macros emit versioned schema records in a WASM custom section. Build tooling
validates them, uses stable qualified identities rather than source regexes,
generates extension-aware `.d.ts`, and may strip the schema from production
artifacts after extraction.

v1 uses normal class strings and repeatable style dependencies:

```rust
#[voo::component]
#[voo::style("./base.css")]
#[voo::style("./Counter.css", scoped)]
pub fn Counter(/* ... */) { /* ... */ }
```

The bundler owns CSS loading, PostCSS, preprocessors, source maps, and HMR.
Rust macros neither compile CSS nor embed it in WASM.

## Store contract

Stores are instance-scoped. They have explicit synchronous actions and an
explicit snapshot, cached identity-stable JavaScript output, store-change
subscription, separate domain notifications, and disposal. Async actions,
automatic rollback after action errors, and global stores are not v1.

The v1 store factory has no constructor-prop channel: it creates the default
Rust state. Framework hooks may accept adapter diagnostics/options, while state
that depends on user input is initialized or changed through explicit actions.

React consumes snapshots with `useSyncExternalStore`; the Vue adapter uses a
lifecycle-safe `useVooyaStore` composable. This name is adapter-specific, not a
cross-framework Vooya API, and it is not limited to Vapor mode. The Vue
composable mirrors `getSnapshot()` after
`subscribe()` notifications and exposes explicit action dispatch; it may
dispose an instance-scoped store on unmount only when requested. Neither
adapter may invent a different ABI, notification ordering, or prop-update
model.

## Non-goals

- `.voo.rs` or `.voo` compatibility.
- Non-DOM renderers, SSR, hydration, or async/concurrent rendering.
- Implicit deep-reactive props or automatic public exports.
- Unspecified ABI coercions or framework-specific type mappings.
