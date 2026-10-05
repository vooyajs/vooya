# SSR 与 0.2.0 计划

SSR 安全岛、具名 Nuxt 消费用例与 Rust provider 抽离属于 **0.2 候选功能批次**，
尚未发布。当前 npm `0.1.0-beta.N` 的支持范围不变；本文的 API 与测试描述对应 main，
不能直接套用到 `@beta` 安装。发布前先审查并冻结范围，再完成内部验收。
Next.js 仍未验证，不是首批 Alpha 的已承诺能力；具体范围见[发布线说明](./release-lines.md)。

## 第一层：SSR 页面中的客户端 WASM 岛

服务器由 React/Vue 输出页面和稳定的 Vooya 宿主节点，Store 的初始状态为
`undefined`。浏览器 hydration 完成后，adapter 再加载 WASM、挂载 Rust 子树和
创建实例级 Store。每个请求不能提前加载浏览器 WASM，也不能共享 Store 实例。

这与“Rust 自己在服务器输出 HTML，再接管 Rust 子树”是两个目标。当前 Rust
组件依赖浏览器 DOM；后一种能力还需要服务端渲染契约、状态传递与 DOM 所有权
设计。加 `use client` 或关闭 SSR 并不能实现它。

## main 中已有的基础改动（未发布）

- Vue 生成的 Store 在挂载后才调用工厂；高级 `useVooyaStore` 也接受惰性工厂。
  SSR 场景应传工厂，已经创建的 Promise/Store 无法被 adapter 撤销初始化。
- React 构建产物保留 `use client`。Next 中调用 `defineVooyaComponent` 或
  `defineVooyaStore` 的模块自身仍需客户端边界，不能在 Server Component 调用这些工厂。
- 补充无 DOM 的服务端渲染、现有宿主节点 hydration、实例隔离和卸载清理测试。
  adapter 层 hydration 使用 JSDOM 与 mock bindings；另有下文的 Nuxt 真实 WASM 消费用例。
  这两层证据均不能证明 Next.js 支持。
- Rust 构建实现抽到内部 provider，公共 `buildApplication` API 保持兼容。
  当前产物接口仍是单 JS/单 WASM 的内部过渡层，不是完整多语言插件协议。

## 具名集成与后续边界

| 路径 | 实际缺口 | 支持声明前的验收 |
| --- | --- | --- |
| Next.js | main 的 Webpack adapter 已加入 Vue/React 的 `.rs`，但还未验证 Next.js；Turbopack 不读取 Webpack 配置，仍需确定 Next 专用的源码或预构建产物接入 | App Router 生产构建、服务端 HTML、WASM URL、hydration、交互、路由切换与卸载 |
| Nuxt | main 已有具名打包消费用例，尚未发布；不能外推到其他版本或 Edge runtime | 下文列出已覆盖的生产 SSR、真实 WASM、独立 Store 与路由清理；发布候选仍需通过完整门禁 |
| Rust provider | 本批限于现有 Rust 实现抽离、兼容 facade、包与类型身份 | 保留现有 Rust 回归和消费测试；多语言协议与正式预编译产品不属于本批 |

Nuxt 的真实 fixture 和 CI 已加入 main；Next.js 接入仍待完成，不能宣传已全面支持 SSR。
详细实施边界、官方参考与发布验收见[英文计划](../../project/ssr-roadmap.md)。

## main API 的 SSR 行为（未发布）

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

新增 `npm run test:nuxt-ssr`：在独立临时项目中安装六个打包后的 Vooya 包，
使用 Nuxt 4.5.2、Vite 8.3.1、Vue 3.5.43，验证生产 Node SSR、真实 WASM、
两个独立 Store、props/事件、scoped CSS、客户端路由切换、Rust 组件与 Store
销毁以及返回页面后的全新状态。由独立 PR CI job 执行，也纳入 `verify:e2e`。
这不代表 Next.js、Edge runtime 或 Rust 服务端 HTML 已经支持。
此 fixture 中 Nuxt 传入的 Vite root 是 `app`，Rust 文件放在 `app/src`；
构建核心也已修复 `sourceRoot: "."` 的路径匹配，并排除依赖和生成目录的扫描。
