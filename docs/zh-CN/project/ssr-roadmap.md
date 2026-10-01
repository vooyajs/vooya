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

## 现有 API 的 SSR 行为

| API | 服务端渲染 | 浏览器生命周期 |
| --- | --- | --- |
| `defineVooyaComponent` | 输出空容器，不调用 `loadBindings` | hydration 后挂载，转发 props/事件，卸载时 dispose |
| 生成的 `use<Name>()` Store hook | state 为 `undefined`，不创建 Store | 每次 hook 调用创建独立实例，订阅并在卸载时取消订阅、dispose |
| Vue `useVooyaStore(() => createStore())` | 不执行 factory | 挂载后创建，创建错误交给 `onError` |
| React `useVooyaStore(factory, props, options)` | 不执行 factory | effect 中创建，同步抛错与 Promise 拒绝均交给 `onError` |
| 生成的 `create<Name>Store()` | 调用即开始加载 runtime，不会自动延迟 | 脱离 hook 使用时，由调用方管理订阅和 dispose |
| bindings 的 `mount(host, ...)` | 需要浏览器 DOM，不提供服务端 HTML 渲染 | 脱离适配器使用时，由调用方负责更新和 dispose |

state 为 `undefined` 时不要派发 action。模块顶层共享 Store 不具备请求隔离；
传给 Vue 的现成 Store 或已启动的 Promise，也无法撤销已经开始的工作。

新增 `npm run test:nuxt-ssr`：在独立临时项目中安装五个打包后的 Vooya 包，
使用 Nuxt 4.5.2、Vite 8.3.1、Vue 3.5.43，验证生产 Node SSR、真实 WASM、
两个独立 Store、props/事件、scoped CSS、客户端路由切换、Rust 组件与 Store
销毁以及返回页面后的全新状态。由独立 PR CI job 执行，也纳入 `verify:e2e`。
这不代表 Next.js、Edge runtime 或 Rust 服务端 HTML 已经支持。
此 fixture 中 Nuxt 传入的 Vite root 是 `app`，Rust 文件放在 `app/src`；
另行发现的 `sourceRoot: "."` schema 路径匹配问题仍待处理。
