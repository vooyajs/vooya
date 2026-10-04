# 发布线与功能批次

Vooya 的 npm 包目前仍为独立版本的 `0.1.0-beta.N`，准确版本见[项目状态](./status.md)。
“0.1 维护线”不表示已经发布稳定版 `0.1.0` 或 `0.1.1`；当前 main 也不等于下一个可直接发布的补丁。

以下是当前 1.0 之前开发周期的实践方案，先在这两条发布线上验证，再评估是否固化为长期规则。

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

## 双线工具与验收

源码候选通过 `.changeset/line.json` 显式选择目标：main 为 `0.2.0-alpha.N`，
release/0.1 为 `0.1.0-beta.N`。维护线只接受 patch Changeset，版本和精确依赖
由审查后的规划交给 Changesets 正式 applier 写入，不手改包版本。

实际源码副本的本地演练得到 9 个 0.2 Alpha 候选；维护线得到 React/Vite beta.3
和 build-core/Rspack/Webpack beta.1 共 5 个候选。未改动的包和历史 changelog 保持不变，
重复执行版本操作不会再次升级。这些都是规划结果，尚未发布。

准备版本 PR 与发布需要分别手动触发 workflow，并指定所选发布分支的完整提交 SHA。
普通源码推送不自动准备或发布。标签只更新候选包，未改依赖按精确版本验收：
Alpha 保护 `latest` 和 `beta`，Beta 保护 `latest` 和 `alpha`；未改包的同渠道标签也保持不变。
重试沿用首次基线，并阻止旧候选回退更新的渠道标签。完整发布门禁与 registry consumer
验收仍需通过，稳定版发布尚未启用。

本页是中文摘要。完整候选、排除项与工具约束以
[发布线审查（英文维护文档）](../../maintainers/release-lines.md)为准；
面向用户的配置差别见[下一轮发布](./next-release.md)，具名测试见[兼容性矩阵](./compatibility.md)，SSR 细节见[SSR 范围](./ssr-roadmap.md)。
