# RFC 0002: Reactive Component Model MVP

## Status

Accepted for Stage 4.

## Decision

`vooya-core` provides a single-threaded `Signal<T>` and explicit `Effect` API.
Signals own a value and notify subscribed effects after `set` or `update`.
Effects own rendering work. The first proof component, `TaskList`, uses three
signals for tasks, filter selection, and validation errors; one effect renders
the component's owned DOM subtree.

```rust
let tasks = signal(Vec::<Task>::new());
let render = effect(move || render(tasks.get()));
let _subscription = tasks.subscribe(render.clone());

tasks.update(|items| items.push(task));
```

## Required behavior in this stage

- State changes trigger subscribed effects synchronously.
- Every subscription returns a disposable handle; dropping it unregisters the
  effect, including when an earlier effect removes a later one during notify.
- Components render only inside their Vooya-owned root.
- Conditional branches are represented by ordinary state-dependent rendering.
- Lists use stable task IDs as DOM keys and move/reuse keyed row roots.
- User input validation is represented as a signal and rendered through an
  accessible `role="alert"` node.

The current Rust-file runtime also provides synchronous `batch` boundaries,
owned listener/subscription cleanup, re-entrant effect-cycle protection, and
DOM child move/replace primitives. Opt-in dependency tracking is available
through `tracked_effect`; the public `rsx!` syntax covers keyed `for` loops and
conditional `if`/`else` branches.

## Non-goals

- Implicit dependency tracking in ordinary `effect` callbacks.
- Async resources or concurrent render.
- A broader template language beyond the current `rsx!` forms.
- Fine-grained child reconciliation below a keyed row root.
- Automatic escaping policy beyond the component's use of structured DOM APIs.

The Task List demonstrates that a manually authored Rust component can be
meaningful before Vooya commits to a source-level component DSL. A later macro
must compile to this runtime contract rather than replace it.
