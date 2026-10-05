# 下一轮发布：0.2 开发中

当前 npm 包仍是[0.1 Beta](./status.md)。下列能力是 main 中拟纳入 0.2 批次的源码工作，
本页尚无可用的 0.2 Alpha 安装命令。源码构建或 tarball 验收通过，不表示
`npm install @vooya/vite@beta` 已包含这些变化。

首次接入使用[已发布版本的快速开始](../guide/getting-started.md)。范围冻结、维护回补
和发布前置条件见[发布线说明](./release-lines.md)；本页说明面向使用者的差别。

## 托管 Rust 工具链

当前源码可发现应用或上级项目声明的可选 `@vooya/preset` 依赖，在隔离缓存中准备
固定版本的 Rust/WASM 工具。它仍在本机编译 Rust，适用平台仍需宿主 linker 和 SDK，
不等于无需 Rust 的组件运行时。

以下配置**尚未发布**：

| 配置 | 当前源码行为 |
| --- | --- |
| `toolchain.mode: "auto"`（默认） | 有声明的 preset 时使用 preset，否则发现系统工具；显式 `cargoPath` 选择系统工具 |
| `toolchain.mode: "system"` | 使用已安装的系统工具，不准备 preset |
| `toolchain.mode: "managed"` | 要求项目存在 preset；与显式 `cargoPath` 同用时报错 |
| `VOOYA_TOOLCHAIN` | 配置 mode 为 `auto` 时选择工具链模式 |
| `vooya doctor --toolchain auto\|system\|managed` | 诊断同一套尚未发布的选择策略 |

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

| 候选能力 | 源码证据与限制 |
| --- | --- |
| Vite 8.2.1 | Vue/React/Solid/Svelte 打包生产与开发用例、严格声明、Rust 错误恢复、连续保存与宿主文件修改 |
| Vite+ 0.2.9 | 按文档的 alias/overrides 使用正常 npm peer 解析；四框架的打包 dev/build 用例不代表全部工具或版本都兼容 |
| Webpack/Rspack `.rs` | Vue/React Component、Store、CSS 与声明；Vue watch 恢复和新增模块检查；其他 watch/框架组合仍未验证 |
| SSR 安全岛 | Vue 惰性 Store 创建与 React 客户端边界；具名 Nuxt 生产及浏览器用例；Rust 内容仍在浏览器挂载，Next.js 尚未验证 |

具体用例见[兼容性矩阵](./compatibility.md)、[实验性配置](../guide/other-integrations.md#vite)
和[SSR 范围](./ssr-roadmap.md)。这些是候选评估路径，不能与当前 npm Beta 包混用。

## Octane 延后

Octane adapter 保留为私有 workspace 实验和独立打包浏览器用例，不纳入本轮 0.2
发布候选或公共发布门禁。目前没有可安装的 `@vooya/octane` 发布版本；后续转为
公开包需重新审查范围、提供首发 Changeset 并完成 registry 验收，不预先承诺日期。

## Rust provider 抽离

[PR #148](https://github.com/vooyajs/vooya/pull/148) 将 Rust 构建实现拆到
`@vooya/provider-rust`，已通过 [PR #149](https://github.com/vooyajs/vooya/pull/149)
合入 main；`@vooya/build-core` 保持兼容入口。该实现保留导出函数、
类型身份和构建产物，不新增公共多语言 provider 注册机制或产物协议。新包与这项
抽离均不属于已发布的 0.1 Beta。

## 如何评估候选

使用同一份已审查 checkout 及其匹配的 tarball，包括精确的内部依赖。仓库的具名测试
会把这些产物安装到干净消费项目；报告结果时记录 commit 与测试命令。不要为了让
安装通过，就用 npm Beta 替换某个未发布依赖。公开 Alpha 安装命令和带版本的迁移说明，
会在发布验收及实际发布后补充；网站是否部署也需单独核对。
