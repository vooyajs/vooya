# 概念

Vooya 的核心是一个清晰的 WASM 集成层边界：宿主应用继续管理页面，Rust
组件岛只拥有自己被授权的局部能力。

| 主题 | 说明 |
| --- | --- |
| [为什么是 Vooya](../why-vooya.md) | 它要标准化什么重复的集成工作？ |
| [Store](./store.md) | 无 DOM 的 Rust 状态如何提供 snapshot、action 和 dispose？ |
| [Component](./component.md) | Rust-owned DOM 能力如何接收 props、发出 events？ |
| [组件边界](./component-boundary.md) | host、DOM、状态和资源分别由谁拥有？ |
| [生命周期与事件（英文设计记录）](../../rfcs/0005-island-events-lifecycle-diagnostics.md) | props、events、错误和 disposal 如何跨边界？ |
| [ABI v1（英文设计记录）](../../rfcs/0007-rust-file-authoring-and-abi-v1.md) | 哪些值可以安全地跨 Rust/JavaScript？ |

当前 alpha 的 Vooya 是 Rust 能力与传统 Web host 之间的集成层。SSR、hydration
和 standalone Rust renderer 还没有进入这条 alpha 路径，但它们是未来可以继续
评估的层，不是永久 non-goal。决定一个能力是否放进 Rust 前，先看[组件边界](./component-boundary.md)。
