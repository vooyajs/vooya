---
layout: home

hero:
  name: Vooya
  text: 面向现有 Web 应用的 WASM 集成层
  tagline: 在保留传统 Web 宿主 renderer 的前提下，把浏览器可运行的 Rust 能力接入一个边界清晰的组件岛。
  actions:
    - theme: brand
      text: 快速开始
      link: /zh-CN/guide/getting-started
    - theme: alt
      text: 先理解边界
      link: /zh-CN/concepts/component-boundary

features:
  - title: 保留宿主应用
    details: 页面树、路由、业务状态和周围 DOM 仍由现有 Web renderer 管理。
  - title: 只拥有局部能力
    details: Rust 组件岛通过 props、events、生命周期和 dispose 与宿主通信。
  - title: 接入 Web 工具链
    details: Vooya 连接 Rust/WASM、框架适配器和 bundler，而不是替换它们。
---

## 为什么会有 Vooya

传统 Web 应用往往只想把一个局部能力交给 Rust，却不想重写页面、路由、
状态和设计系统，也不想每个项目重新手写 WASM wrapper、生命周期、事件、类型
和 bundler glue。Vooya 把“宿主应用 + 一个 Rust/WASM 能力岛”的重复集成工作
标准化。它是面向传统 Web ↔ WASM 的 framework-agnostic 集成层，不是某个
特定框架的替代品。Vue 和 React 是当前 first-party adapter 与测试证据。

先读[为什么是 Vooya](why-vooya.md)和[组件边界](concepts/component-boundary.md)，
再开始[快速开始](guide/getting-started.md)。

## 为什么选择 Vooya？

如果传统 Web 应用需要加入 Rust/WASM 能力，Vooya 可以把 WASM 加载、typed ABI、
framework adapter、生命周期、事件、dispose、diagnostics、声明文件和 bundler
产物这些重复工作标准化，让自定义 WASM wrapper 变成可以测试、维护并跨项目演进
的工具链表面，而不是每个项目重新拼一套 glue。

Canvas/WebGL、编辑器、解析器、数据密集型控件、局部 store，以及其他边界清晰的
能力都适合作为起点。当前 alpha 聚焦于能力岛边界，普通页面布局、路由、表单和
全局状态继续由宿主 renderer 管理。

SSR、hydration 和 standalone Rust renderer 尚未进入当前 alpha 路径，但它们是未来
可以继续评估和建设的层，不是永久排除项。Vooya 也不承诺 WASM 自动更快，具体
workload 仍应与真实宿主基线测量。

当前版本为 `v0.1.0-alpha.10`。Vite Rust-file 路径是主要 source-authoring
路径，Rspack 与 Webpack 仍是 experimental；预编译组件产品尚未正式发布。
请从[快速开始](guide/getting-started.md)开始，再看[项目状态](project/status.md)。
