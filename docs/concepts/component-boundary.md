# The Component Boundary

Vooya is a WASM integration layer, not a replacement application framework. The
traditional Web renderer continues to own the application tree, routing,
surrounding state, and the element used to mount a Vooya component. Vue and
React are the supported first-party adapters; Solid and Svelte are experimental. The
boundary itself is not tied to any of them.

After mount, the ownership boundary is:

```text
traditional Web application
  -> framework-owned host element
     -> Vooya-owned DOM subtree
        -> Rust state, listeners, and rendering
```

The host framework sends initial props through the generated WASM mount
function. Later prop changes call generated `update_<prop>` methods. Rust emits
browser `CustomEvent` instances using the `vooya-<event>` prefix; the adapter
turns those into Vue emits or React/Solid/Svelte callbacks.

Events are dispatched on that exact host and do **not** bubble. They are a
narrow adapter transport, not an ambient application event bus: outer DOM
listeners and nested islands cannot accidentally consume a component event.
The adapter subscribes before mounting and removes its listener before disposal.

Unmounting calls `dispose` and drops the WASM handle. The component must remove
its owned root and release resources it created.

| Boundary operation | Host side | Rust/WASM side | Ownership rule |
| --- | --- | --- | --- |
| Mount | Creates/provides the host element | Creates the island root and state | The host owns the element; Rust owns descendants |
| Update | Sends declared prop values | Applies an atomic update | Values cross the owned ABI v1 boundary |
| Event | Receives the adapter callback | Emits a non-bubbling `vooya-*` event | Events stay on the component host |
| Dispose | Unmounts the framework component | Removes DOM and releases resources | Every Rust listener/resource must have an owner |

The practical lifecycle is therefore `mount → update* → dispose`; an error can
occur during any stage and is reported through the framework adapter.

## ABI at a glance

| Value family | JavaScript representation | Current boundary |
| --- | --- | --- |
| Finite numbers, booleans, strings | `number`, `boolean`, `string` | Supported when owned and schema-valid |
| Big integers | `bigint` | Supported; do not coerce through `number` |
| Vectors, tuples, string-key maps | Arrays, fixed tuples, `Record<string, T>` | Supported when every nested value is supported |
| Recursive structs, borrowed values, arbitrary generics | — | Rejected or outside ABI v1 |

## Why an island boundary

Moving every DOM operation across JavaScript/WASM would add boundary overhead
without creating a useful ownership model. Vooya instead crosses the boundary
for coarse lifecycle operations:

- mount;
- prop update;
- component event;
- dispose.

Computation, state derivation, and repeated rendering work can remain in Rust.
The surrounding application still gets a normal framework component.

This is most plausible for data grids, editors, timelines, visualization
controls, canvas or WebGL surfaces, and components backed by existing Rust
libraries. It is not a claim that WASM makes ordinary DOM work faster.

## Current runtime layers

The generated framework-neutral bridge carries the contract and asynchronous
binding loader. Each framework adapter owns host lifecycle, prop and event
forwarding, error delivery, and disposal using its native primitives. Load,
mount, update, and dispose failures use Vue's `error` channel or React/Solid/Svelte's
`onError` callback. The generated application crate owns the export shape and
ABI version check. This bridge is generated implementation output, not a
stable author-facing IR.

`@vooya/core` provides the Rust runtime source used by that generated crate:

- `View` and `ViewElement` for structured DOM creation;
- `EventListener` for owned browser callbacks;
- `Signal<T>`, `Effect`, disposable `SignalSubscription<T>` handles, and the
  opt-in `tracked_effect` dependency collector;
- synchronous `batch` boundaries and owned child move/replace primitives for
  the in-progress branch and keyed-list runtime.

The reactive API is intentionally small. The `rsx!` macro still emits explicit
bindings, while `tracked_effect` provides opt-in dependency collection; async
work is not scheduled by this runtime. Subscriptions unregister when their
handle is dropped, so component and branch cleanup is deterministic.

## Explicit non-goals

The current design does not include SSR, hydration, framework slots, deep host
object synchronization, global state management, routing, or a standalone
Vooya application runtime.

See [RFC 0001](../rfcs/0001-component-islands.md) for the original ownership
decision and [RFC 0002](../rfcs/0002-reactive-component-model.md) for the
reactive prototype.
