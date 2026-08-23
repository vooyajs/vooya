# 指南

这组指南先建立 WASM 集成层的 mental model，再带你跑通第一个 Rust 组件，
最后查工具参数和兼容性边界。也可以先读[为什么是 Vooya](../why-vooya.md)，
了解这层要解决的重复集成问题。

## 先理解 mental model

宿主框架拥有页面树、路由、业务状态和 host element。Vooya 在这个 element
下面挂载一个 Rust-owned island，通过 props、events、lifecycle 和 disposal
保持边界明确。拿不准时，先看[组件边界](../concepts/component-boundary.md)。

## 选择入口

| 目标 | 从这里开始 |
| --- | --- |
| 跑起第一个组件 | [快速开始](./getting-started.md) |
| 编写 Rust 组件或 store | [Rust 编写](./rust-file-authoring.md) |
| 选择 Vite/Rspack/Webpack | [Bundler 指南](./bundlers.md) |
| 排查本地构建 | [排错](./troubleshooting.md) 与 [FAQ](../faq.md) |

当前 alpha 的 source consumer 需要 Rust/Cargo、`wasm32-unknown-unknown` 和
指定版本的 `wasm-bindgen-cli`。预编译消费者路线仍是未来产品，不要把测试
fixture 当成已经发布的组件库。
