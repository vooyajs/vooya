# The Component Boundary

Vooya is a component compiler, not a replacement application framework. Vue or
React continues to own the application tree, routing, surrounding state, and
the element used to mount a Vooya component.

After mount, the ownership boundary is:

```text
Vue / React application
  -> framework-owned host element
     -> Vooya-owned DOM subtree
        -> Rust state, listeners, and rendering
```

The host framework sends initial props through the generated WASM mount
function. Later prop changes call generated `update_<prop>` methods. Rust emits
browser `CustomEvent` instances using the `vooya-<event>` prefix; the adapter
turns those into Vue emits or React callbacks.

Events are dispatched on that exact host and do **not** bubble. They are a
narrow adapter transport, not an ambient application event bus: outer DOM
listeners and nested islands cannot accidentally consume a component event.
The adapter subscribes before mounting and removes its listener before disposal.

Unmounting calls `dispose` and drops the WASM handle. The component must remove
its owned root and release resources it created.

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

The generated framework adapter owns asynchronous WASM loading, host lifecycle,
prop forwarding, event forwarding, lifecycle errors, and disposal. Load, mount,
update, and dispose failures use the same Vue `error` / React `onError` channel.
The generated
application crate owns the stable export shape and ABI version check.

`@vooya/core` provides the Rust runtime source used by that generated crate:

- `View` and `ViewElement` for structured DOM creation;
- `EventListener` for owned browser callbacks;
- `Signal<T>`, `Effect`, and disposable `SignalSubscription<T>` handles for
  the current explicit subscription prototype;
- synchronous `batch` boundaries and owned child move/replace primitives for
  the in-progress branch and keyed-list runtime.

The reactive API is intentionally small. It does not yet infer dependencies or
schedule asynchronous work. Subscriptions unregister when their handle is
dropped, so component and branch cleanup is deterministic.

## Explicit non-goals

The current design does not include SSR, hydration, framework slots, deep host
object synchronization, global state management, routing, or a standalone
Vooya application runtime.

See [RFC 0001](../rfcs/0001-component-islands.md) for the original ownership
decision and [RFC 0002](../rfcs/0002-reactive-component-model.md) for the
reactive prototype.
