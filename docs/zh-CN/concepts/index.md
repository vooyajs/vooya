# 概念

Vooya 的核心是一个清晰的 WASM 集成层边界：宿主应用继续管理页面，Rust
组件岛只拥有自己被授权的局部能力。

| 主题 | 说明 |
| --- | --- |
| [组件边界](./component-boundary.md) | host、DOM、状态和资源分别由谁拥有？ |
| [生命周期与事件（英文设计记录）](../../rfcs/0005-island-events-lifecycle-diagnostics.md) | props、events、错误和 disposal 如何跨边界？ |
| [ABI v1（英文设计记录）](../../rfcs/0007-rust-file-authoring-and-abi-v1.md) | 哪些值可以安全地跨 Rust/JavaScript？ |

Vooya 不是 Vue/React 替代品、通用 Rust renderer、SSR/hydration 框架，也不
承诺 WASM 自动更快。决定一个能力是否放进 Rust 前，先看[组件边界](./component-boundary.md)。
