# 兼容性

这张表记录仓库里的自动化证据，不是跨浏览器认证或生产支持承诺。

## Beta 四框架适配情况

Vue、React、Solid、Svelte 的 adapter 都已随 `0.1.0-beta.0` 发布，可以从 npm
`beta` 渠道安装。但“已发包”不等于“支持宿主框架的全部功能”：Vue/React 是主支持
路径，Solid/Svelte 仍为实验性支持。

| 能力与验收 | Vue 3 | React 19 | Solid 1.9 | Svelte 5 |
| --- | --- | --- | --- | --- |
| Beta 支持级别 | 支持 | 支持 | 实验性 | 实验性 |
| Rust 组件挂载、props 更新、事件回调 | 已验证 | 已验证 | 已验证 | 已验证 |
| 实例级 Store action 与响应式快照 | `Ref`：`state.value` | snapshot：`state` | `Accessor`：`state()` | `Readable`：`$state` |
| 组件/Store 声明、owned struct 与 unit enum 类型生成 | 已实现 | 已实现 | 已实现 | 已实现 |
| 生命周期证据 | 挂载卸载、Store 延迟返回清理 | StrictMode、Store 延迟返回清理 | adapter 测试覆盖 owner 清理和延迟返回 | 子组件卸载时 Component/Store 各 dispose 一次 |
| Rust 源码生产构建与浏览器用例 | Vite 7 + Chromium | Vite 7 + Chromium | Vite 7 + Chromium | Vite 7 + Chromium |
| 干净项目安装打包产物的独立验收 | 已覆盖 | 已覆盖 | Vite 8 已覆盖 | Vite 8 已覆盖 |
| npm registry 独立验收 | 已覆盖 | 已覆盖 | 尚未覆盖 | 尚未覆盖 |
| SSR / hydration / slots | 未支持 | 未支持 | 未支持 | 未支持 |

[Beta.0 发布流程](https://github.com/vooyajs/vooya/actions/runs/36614375254)
已通过完整 `verify:release`，其中包含四个 `test:rust-*` 浏览器用例。adapter
单元测试与共享 build-core 声明测试补充类型和生命周期证据；`test:packed-release`
与 `test:registry` 的干净消费项目则仅覆盖 Vue/React，不能因为四个包都已发布就
把这项证据扩展到 Solid/Svelte。

这次 Beta 还修复了 React 将已就绪的 `null` Store 快照当成未加载的问题，以及
Vue 将未传入的可选 Boolean prop 转成 `false` 的问题。Solid/Svelte 原有路径已
保留这些值，不需要照搬相同修复。

`test:vite8-frameworks` 已增加 Solid/Svelte 干净 tarball 安装、Vite 8.2.1
生产构建、Chromium 交互和严格声明类型检查。Svelte 的 Vite 8 路径使用
`@sveltejs/vite-plugin-svelte` 7.1.2。npm registry 验收仍待补齐，支持级别仍为
实验性。配置示例见[快速开始](../guide/getting-started.md)。

## 版本与工具链边界

| 层 | 版本 | 状态 | 边界 |
| --- | --- | --- | --- |
| Node.js | `^20.19.0 \|\| >=22.12.0` | Supported | quickstart 覆盖 Ubuntu/Node 20、macOS/Node 22、Windows/Node 22 |
| Vue | `>=3.5.2 <4` | Supported | 3.5.2–3.5.41 声明检查通过；3.6/Vapor 仍是 experimental evidence |
| React | `>=19` | Supported | fixture 覆盖 19.0.0 与 19.2.0 |
| Solid | `>=1.9 <2` | Experimental | Vite 7 browser fixture 覆盖 Rust Component、callback event 和 Accessor 驱动的 Store 更新；adapter unit test 覆盖 owner cleanup 与 late resolve |
| Svelte | `>=5 <6` | Experimental | Svelte 5 + Vite 7 Chromium fixture 覆盖 Component mount/callback、Store action、prop update、`Readable` 声明，以及 Component/Store owner cleanup |
| Octane | `0.9.0` | Experimental，仅客户端 | 原生 plugin 0.2.1；Vite 8 与 Vite+ 0.2.9 packed fixture 覆盖 Component/Store 实例隔离、props/event、销毁重建及严格声明；Node >=22.22.2，未覆盖 SSR |
| Vite | `>=7 <9` | 主路径 | Vite 8.2.1 是主要 packed target，Vite 7 保持回归测试 |
| Vite+ | `0.2.9`，core alias `0.2.9`（Vite `8.2.1`） | 固定版本验收 | Vue/React/Solid/Svelte/Octane 的干净 tarball 安装、`.rs` 生产构建、Chromium、严格声明检查、dev 重建与错误恢复 |
| Rspack / Rsbuild | Rspack `>=2.1.10`；Rsbuild `>=2.1.13` | Experimental | 保留旧 Vue/React/Rslib fixture；新增 Vue/React `.rs` 生产验收 |
| Webpack | `>=5` | Experimental | 5.101.0、5.109.2 fixture；Webpack 4 不支持 |
| Vue Vapor | Vue 3.6.0-beta.17 + Vite 8.2.1 | Experimental | 需要 Vue 的 `vaporInteropPlugin`，不是 Vooya 自己的 renderer |

Solid 这一行只说明当前 Vite 7 + Chromium fixture 与 adapter unit test 的证据，
另有 Vite 8 packed 证据；不推导 Rspack/Webpack、SSR、hydration 或其他浏览器已经兼容。
Svelte 这一行同样只说明具名 Vite 7 + Chromium fixture；不推导 Svelte 3/4、
SvelteKit、SSR/hydration、Rspack/Webpack 或其他浏览器已经兼容。fixture
在卸载子组件后断言 Component handle 与 generated Store 各调用一次 `dispose()`。

`test:vite-plus-frameworks` 还覆盖快速连续保存及宿主组件更新；Rust 编辑使用整页刷新，
不承诺保留状态。`test:vite-plus` 单独保留旧 `.voo` 回归。依赖按官方 alias/overrides
配置即可正常 npm 安装，不需要 legacy peer resolver。范围限定为上述版本的 dev/build，
不推导其他 Vite+ 版本、其全部工具或 SSR 支持。配置见 [Vite+ 接入](../guide/other-integrations.md#vite)。

## 下一版 Rust-file bundler 接入

`test:rust-bundlers` 从当前源码打包，在干净项目中验证 Webpack 5.109.2、
Rspack 2.1.10 与 Vue/React 的 `.rs` Component、Store、props/event、scoped CSS、
卸载重建，以及应用根目录 `rust.sourceRoot: "."`。这是下一版代码的验证，
不代表已发布 Beta 包具备此能力。Vue 的 Rust-file watch 还覆盖错误恢复、
CSS 更新、新增 `.rs` 和产物不会造成循环重建。Next.js/SSR、Webpack/Rspack
下的 Solid/Svelte 尚未完成验收。

## 尚未支持或未验证

Safari/WebKit、移动浏览器、SSR、hydration、Rollup、Turbopack 和未列出的
bundler 没有当前兼容性声明。没有正式预编译组件产品；保留的 Vue fixture
只是 build-contract 证据。`.voo` 是已退休的探索格式，不能作为新组件输入。

查看每项命令和完整边界请看[英文兼容性矩阵](../../project/compatibility.md)。
