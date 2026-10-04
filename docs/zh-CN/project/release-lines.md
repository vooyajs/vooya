# 发布线与功能批次

Vooya 的 npm 包目前仍为独立版本的 `0.1.0-beta.N`，准确版本见[项目状态](./status.md)。
“0.1 维护线”不表示已经发布稳定版 `0.1.0` 或 `0.1.1`；当前 main 也不等于下一个可直接发布的补丁。

## 0.1：维护已发布行为

只从已发布基线挑选可复现缺陷及其回归测试。本轮有两个回补候选：React Store
factory 同步抛错应交给 `onError`；Rust sourceRoot 的点路径规范化及依赖目录排除。
它们尚未回补发布，不能复制整个 SSR 或 bundler 功能 PR 来代替最小修复。

显式 `?raw` 源码导入和生成 Store 接口类型修复已经发布，不属于本轮新增工作。
已发布用户继续按照[快速开始](../guide/getting-started.md)安装 `@beta` 并保留 lockfile。

## 0.2：先冻结，再验收和发布 Alpha

本批候选围绕 Rust 工具链安装与宿主集成：

| 候选范围 | 限定边界 |
| --- | --- |
| Rust provider 包 | 现有 Rust 实现抽离、兼容 facade 与消费测试，不建立公共多语言协议 |
| 可选托管 Rust preset | 固定工具、下载校验、缓存和恢复；仍需宿主 SDK/linker |
| SSR 安全岛与 Nuxt | 浏览器挂载 WASM，服务器仅渲染宿主容器；Next.js 尚未验证 |
| Webpack/Rspack 普通 `.rs` | Vue/React Component、Store、CSS、声明与已验证 watch 恢复；仍为实验性 |
| Octane 与 Vite+ | 原生 Octane adapter 和五框架具名 Vite+ 用例；固定版本的实验性证据 |

这些能力目前只在源码中，不能由当前 `@beta` 安装获得。Go/TinyGo、新框架、
多语言 preset、Rust 服务端 HTML 和保留状态的 Rust HMR 不在本批范围。
历史实验与 RFC 可以保留，但不是本批发布要求。

先审查范围并冻结新增能力，再完成内部测试、干净消费、浏览器生命周期和失败恢复验收。
Alpha 仍是预发布；Beta 与稳定版需要各自的消费反馈和发布门禁，不会因 CI 通过自动晋级。
各包继续独立版本化，不为统一编号而升级未改动的包。

## 发布工具尚需准备

现有 Changesets/publisher 仍围绕 main 的 0.1 Beta 配置，尚不能直接表达这两条发布线。
标记 `minor` 不会自动生成 0.2，标记 `patch` 也不能证明某项变更适合回补 0.1。
当前 Alpha 发布路径只保护 `latest`，还不足以保证 0.2 Alpha 不改变既有 0.1 Beta。
标签同步目前遍历公开包并要求同一渠道；需要将待更新标签的候选包，与用于验证依赖闭包
的包集合分开。必须先验证目标版本、依赖闭包、渠道保护、重试与重复版本行为，
保留现有 Beta 和 `latest` 标签；不能在 main 直接换 tag、合并版本 PR 或隐藏 Changeset 来模拟分线。

本页是中文摘要。完整候选、排除项与工具约束以
[发布线审查（英文维护文档）](../../maintainers/release-lines.md)为准；
面向用户的配置差别见[下一轮发布](./next-release.md)，具名测试见[兼容性矩阵](./compatibility.md)，SSR 细节见[SSR 范围](./ssr-roadmap.md)。
