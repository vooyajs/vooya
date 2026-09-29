# SSR 与 0.2.0 计划

下一轮功能版本定为 **0.2.0**：推进 Next.js（React）、Nuxt（Vue）的 SSR 接入，
以及 Rust provider 抽离。缺陷修复用 patch，新功能用 minor；本次不直接改版本号
或发布 0.2.0。已经发布的 Beta 支持范围保持不变。

## 第一层：SSR 页面中的客户端 WASM 岛

服务器由 React/Vue 输出页面和稳定的 Vooya 宿主节点，Store 的初始状态为
`undefined`。浏览器 hydration 完成后，adapter 再加载 WASM、挂载 Rust 子树和
创建实例级 Store。每个请求不能提前加载浏览器 WASM，也不能共享 Store 实例。

这与“Rust 自己在服务器输出 HTML，再接管 Rust 子树”是两个目标。当前 Rust
组件依赖浏览器 DOM；后一种能力还需要服务端渲染契约、状态传递与 DOM 所有权
设计。加 `use client` 或关闭 SSR 并不能实现它。

## 这批基础改动

- Vue 生成的 Store 在挂载后才调用工厂；高级 `useVooyaStore` 也接受惰性工厂。
  SSR 场景应传工厂，已经创建的 Promise/Store 无法被 adapter 撤销初始化。
- React 构建产物保留 `use client`。Next 中调用 `defineVooyaComponent` 或
  `defineVooyaStore` 的模块自身仍需客户端边界，不能在 Server Component 调用这些工厂。
- 补充无 DOM 的服务端渲染、现有宿主节点 hydration、实例隔离和卸载清理测试。
  hydration 使用 JSDOM 与 mock bindings，尚不是 Next/Nuxt 的真实 WASM 浏览器验收。
- Rust 构建实现抽到内部 provider，公共 `buildApplication` API 保持兼容。
  当前产物接口仍是单 JS/单 WASM 的内部过渡层，不是完整多语言插件协议。

## 接下来必须补齐

| 路径 | 实际缺口 | 支持声明前的验收 |
| --- | --- | --- |
| Next.js | 现有 Webpack adapter 仅支持旧 `.voo`；Turbopack 不读取 Webpack 配置，需要确定真正可用的 `.rs` 或预构建产物接入 | App Router 生产构建、服务端 HTML、WASM URL、hydration、交互、路由切换与卸载 |
| Nuxt | 验证 Vite 的服务端/客户端两套构建与 Nitro 产物，不能只靠 Vue adapter 测试 | SSR 生产构建启动、HTML、真实 WASM 交互、hydration、路由清理与请求隔离 |
| Provider | 版本化多资产产物、运行环境约束、缓存身份、进一步收拢 Rust schema/binding 逻辑 | 现有 Rust 回归不退化，预编译 consumer 不依赖 Cargo，再考虑其他语言 canary |

Next/Nuxt 的真实 fixture 和 CI 尚待完成，现在不能宣传已全面支持 SSR。
详细实施边界、官方参考与发布验收见[英文计划](../../project/ssr-roadmap.md)。
