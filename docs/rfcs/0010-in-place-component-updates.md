# RFC 0010: opt-in in-place component updates

Status: implemented alpha contract.

## Decision

`#[voo::component(update = "path::to::handler")]` preserves the mounted root
when framework props change and invokes:

```rust
fn update(root: &voo::ViewElement, props: Props) -> Result<(), JsValue>
```

The path is resolved by Rust at compile time. The handler receives the complete
next props object, not a partial patch. Its work is synchronous and must leave
the component in a valid state if it succeeds. Disposal remains owned by the
original root cleanup scope.

This opt-in exists for stateful surfaces such as Canvas, editors, and media
players whose DOM identity and browser resources must survive a prop update.
The default remains replace-root for compatibility. The alpha does not add an
async update hook, diff individual Rust fields, or expose arbitrary JS objects.

