# 0.2 Alpha：可选安装与边界

[0.2 Alpha 发布运行](https://github.com/vooyajs/vooya/actions/runs/37315595525)发布了八个 `0.2.0-alpha.0` 包：
`@vooya/vite`、`@vooya/vue`、`@vooya/react`、`@vooya/build-core`、
`@vooya/provider-rust`、`@vooya/preset`、`@vooya/rspack`、`@vooya/webpack`。
`@vooya/core`、`@vooya/compiler` 保持 `0.1.0-beta.0`；Solid、Svelte adapter
保持 `0.1.0-beta.2`，本次没有这两个 adapter 的 Alpha 包。不要强制所有包同版。
Octane 仍是延期的私有实验。

本次运行通过完整 `verify:release` 门禁并发布了八个包，但 registry 传播检查超时，
工作流最终为失败，不能称为全绿发布运行。[发布与恢复记录](../../maintainers/releases/0.2.0-alpha.0.md)
保存原始基线、独立 receipt 与精确 registry 检查。Vue/React registry 消费及独立 preset
registry 消费的本地验收已通过；preset 复用托管缓存，不代表重新验证了下载。


默认快速开始继续使用 Beta。托管工具链、具名 Vite 8/Vite+ 与 Rust bundler 路径、
SSR 安全客户端岛需要主动选择 Alpha，见[包状态](./status.md)。
发布不等于所有框架或 SSR 组合都兼容；源码 fixture 也不等于独立 registry 消费验收。

## 在已有 Vite 应用中安装

保留[快速开始](../guide/getting-started.md)的宿主框架插件和 Rust 示例，按框架选择一个 adapter。

```sh
npm install -D @vooya/vite@0.2.0-alpha.0
# Vue
npm install @vooya/vue@0.2.0-alpha.0
# 或 React
npm install @vooya/react@0.2.0-alpha.0
# 可选：固定版本的托管 Rust/WASM 工具
npm install -D @vooya/preset@0.2.0-alpha.0
npx vooya doctor --json
npm run dev
# 检查应用与生成声明后，按 Ctrl+C 停止开发服务器。
npm run build
```

Solid/Svelte 应用保留 `0.1.0-beta.2` adapter，配合 `@vooya/vite@0.2.0-alpha.0`，不要安装不存在的
adapter Alpha。`0.2.0-alpha.0` 是 Vooya 插件版本，宿主 bundler 是 Vite 7 或 8。Node 与框架插件版本仍以[兼容性矩阵](./compatibility.md)为准。
未安装 preset 时继续准备系统 Rust target 与匹配的 wasm-bindgen CLI；安装 preset 后仍需宿主 SDK/linker。
普通应用不需要直接依赖 provider-rust。

## 托管 Rust 工具链

Alpha 接入可发现应用或上级项目声明的可选 `@vooya/preset` 依赖，在隔离缓存中准备
固定版本的 Rust/WASM 工具。它仍在本机编译 Rust，适用平台仍需宿主 linker 和 SDK，
不等于无需 Rust 的组件运行时。

以下配置从 **0.2.0-alpha.0** 起可用：

| 配置 | Alpha 行为 |
| --- | --- |
| `toolchain.mode: "auto"`（默认） | 有声明的 preset 时使用 preset，否则发现系统工具；显式 `cargoPath` 选择系统工具 |
| `toolchain.mode: "system"` | 使用已安装的系统工具，不准备 preset |
| `toolchain.mode: "managed"` | 要求项目存在 preset；与显式 `cargoPath` 同用时报错 |
| `VOOYA_TOOLCHAIN` | 配置 mode 为 `auto` 时选择工具链模式 |
| `vooya doctor --toolchain auto\|system\|managed` | 诊断同一套 Alpha 选择策略 |

托管安装失败时，先检查下载或宿主依赖错误，修复后重试；不会静默回退到系统工具。
需要系统工具时应显式选择 `system`。缓存和平台细节见
[preset 源码 README](https://github.com/vooyajs/vooya/blob/main/packages/preset/README.md)。
已发布 Beta 用户继续使用[系统工具链诊断](../reference/tooling.md)。

源码验收命令为 `npm run test:preset-consumer`：在独立 Vue 应用中安装七个匹配的
tarball，验证普通 `npm run dev`、浏览器 Component/Store 交互、Rust 修改、编译错误
恢复及 `npm run build`。用例屏蔽环境中的 Rust 命令，同时保留宿主 SDK/linker。
CI 在 Linux、macOS、Windows 上使用新的托管缓存执行同一用例；本地复用缓存通过
不代表重新验证了下载流程。

## 宿主集成

| 接入能力 | 具名 fixture 证据与限制 |
| --- | --- |
| Vite 8.2.1 | Vue/React/Solid/Svelte 打包生产与开发用例、严格声明、Rust 错误恢复、连续保存与宿主文件修改 |
| Vite+ 0.2.9 | 按文档的 alias/overrides 使用正常 npm peer 解析；四框架的打包 dev/build 用例不代表全部工具或版本都兼容 |
| Webpack/Rspack `.rs` | Vue/React Component、Store、CSS 与声明；Vue watch 恢复和新增模块检查；其他 watch/框架组合仍未验证 |
| SSR 安全岛 | Vue 惰性 Store 创建与 React 客户端边界；具名 Nuxt 生产及浏览器用例；Rust 内容仍在浏览器挂载，Next.js 尚未验证 |

具体用例见[兼容性矩阵](./compatibility.md)、[实验性配置](../guide/other-integrations.md#vite)
和[SSR 范围](./ssr-roadmap.md)。按上方精确版本图安装。源码 fixture 表示具名覆盖，不代表任意后续 main 提交都已发布。

## Octane 延后

Octane adapter 保留为私有 workspace 实验和独立打包浏览器用例，不纳入本轮 0.2
Alpha 发布或公共发布门禁。目前没有可安装的 `@vooya/octane` 发布版本；后续转为
公开包需重新审查范围、提供首发 Changeset 并完成 registry 验收，不预先承诺日期。

## Rust provider 抽离

[PR #148](https://github.com/vooyajs/vooya/pull/148) 将 Rust 构建实现拆到
`@vooya/provider-rust`，已通过 [PR #149](https://github.com/vooyajs/vooya/pull/149)
合入 main；`@vooya/build-core` 保持兼容入口。该实现保留导出函数、
类型身份和构建产物，不新增公共多语言 provider 注册机制或产物协议。新包与这项
抽离均不属于已发布的 0.1 Beta。

## 复现源码证据

仓库具名测试从已审查 checkout 构建匹配 tarball。报告时记录提交与命令；后续 main
可能包含 alpha.0 尚无的改动。应用安装应使用上面的精确 registry 版本。
发布与官网部署是独立步骤，文档合并本身不表示线上页面已经更新。
