---
layout: home

hero:
  name: Vooya
  text: 面向现有 Web 应用的 WASM 集成层
  tagline: 在保留 Vue、React 等宿主框架的前提下，把浏览器可运行的 Rust 能力接入一个边界清晰的组件岛。
  actions:
    - theme: brand
      text: 快速开始
      link: /zh-CN/guide/getting-started
    - theme: alt
      text: 先理解边界
      link: /zh-CN/concepts/component-boundary

features:
  - title: 保留宿主应用
    details: 页面树、路由、业务状态和周围 DOM 仍由 Vue 或 React 管理。
  - title: 只拥有局部能力
    details: Rust 组件岛通过 props、events、生命周期和 dispose 与宿主通信。
  - title: 接入 Web 工具链
    details: Vooya 连接 Rust/WASM、框架适配器和 bundler，而不是替换它们。
---

## 为什么会有 Vooya

已有 Vue/React 应用往往只想把一个局部能力交给 Rust，却不想重写页面、路由、
状态和设计系统，也不想每个项目重新手写 WASM wrapper、生命周期、事件、类型
和 bundler glue。Vooya 把“宿主应用 + 一个 Rust/WASM 能力岛”的重复集成工作
标准化。它是 WASM 集成层，不是 Vue、React 或 Rust UI framework。

先读[为什么是 Vooya](why-vooya.md)和[组件边界](concepts/component-boundary.md)，
再开始[快速开始](guide/getting-started.md)。

## 适用与不适用

Canvas/WebGL、编辑器、解析器、数据密集型控件和局部 store 都适合作为起点。
普通页面布局、路由、表单和全局状态不需要交给 Vooya。Vooya 也不承诺 WASM
自动更快，当前更不是 SSR 框架或通用 Rust renderer。

当前版本为 `v0.1.0-alpha.10`。Vite Rust-file 路径是主要 source-authoring
路径，Rspack 与 Webpack 仍是 experimental；预编译组件产品尚未正式发布。
请从[快速开始](guide/getting-started.md)开始，再看[项目状态](project/status.md)。
