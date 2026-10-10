# 项目状态

## 可选的 0.2 Alpha

[0.2 Alpha 发布运行](https://github.com/vooyajs/vooya/actions/runs/37315595525)发布了八个 `0.2.0-alpha.0` 包：
`@vooya/vite`、`@vooya/vue`、`@vooya/react`、`@vooya/build-core`、
`@vooya/provider-rust`、`@vooya/preset`、`@vooya/rspack`、`@vooya/webpack`。
`@vooya/core`、`@vooya/compiler` 保持 `0.1.0-beta.0`；Solid、Svelte adapter
保持 `0.1.0-beta.2`，本次没有这两个 adapter 的 Alpha 包。不要强制所有包同版。
Octane 仍是延期的私有实验。

原发布工作流在发布完成后失败；独立 registry 恢复验收及 GitHub 预发布核对已完成。
证据与限制见[发布记录](../../maintainers/releases/0.2.0-alpha.0.md)。

默认快速开始继续使用 Beta。托管工具链、具名 Vite 8/Vite+ 与 Rust bundler 路径、
SSR 安全客户端岛需要主动选择 Alpha，见 [Alpha 安装](./next-release.md)。
发布不等于所有框架或 SSR 组合都兼容；源码 fixture 也不等于独立 registry 消费验收。

Vooya 首个 Beta 的十个公开包均发布为 `0.1.0-beta.0`。当前 npm `beta` 渠道中，
`@vooya/vite`、`@vooya/react`、`@vooya/solid`、`@vooya/svelte` 为
`0.1.0-beta.2`，`@vooya/vue` 为 `0.1.0-beta.1`；其余五个包
（`@vooya/core`、`@vooya/compiler`、`@vooya/build-core`、`@vooya/rspack`、
`@vooya/webpack`）仍为 `0.1.0-beta.0`。按包从 `beta` 渠道安装。
项目仍处于预发布阶段，不承诺稳定 ABI 或全面生产兼容。后续按包独立发版，
build 包的内部依赖保持精确版本；不要求所有包永久同版本，安装后应保留 lockfile。

四个框架 adapter 都已发布：Vue/React 是主支持路径，Solid/Svelte 仍是实验性
支持，具体差别见[四框架能力表](./compatibility.md)。
[Beta.0 发布验收](https://github.com/vooyajs/vooya/actions/runs/36614375254)
已通过四框架 Rust-file 浏览器用例，以及 Vue/React 的干净打包产物和 npm 消费验证。
Solid/Svelte 还没有后者的独立验收，不能宣传为与 Vue/React 同等覆盖。

[Beta.1 发布流程](https://github.com/vooyajs/vooya/actions/runs/36997152925)
已通过发布门禁、精确版本 registry 消费验证和更新包集合的 GitHub Release 发布。
这是对应版本的发布证据，不扩大框架兼容性矩阵。

当前版本包含两项来自 Vooya Lab 接入的修复：Vite 保留显式的
[`?raw` Rust 源码导入](https://github.com/vooyajs/vooya/pull/142)，
四个 adapter 可直接接收[生成的 Store 接口](https://github.com/vooyajs/vooya/pull/143)，
无需任意字符串索引签名。Store 类型修复自 Vue beta.1 和
React/Solid/Svelte beta.2 起可用；源码导入修复需要 Vite beta.2。

Vooya Lab 持续作为 self-hosting 与 evidence 计划：影响产品契约的发现必须回流为
本仓库的 focused issue 和修复。它不构成第二套支持矩阵，也不会自动成为未完成的
Beta 发布 gate；见 [RFC 0011](../../rfcs/0011-lab-self-hosting-program.md) 和
[Issue #103](https://github.com/vooyajs/vooya/issues/103)。

## 已发布 Beta 的验证范围

- 普通 `.rs` component/store 编译为 application-local WASM。
- Vue 3 与 React 19 的 props、events、Store、lifecycle、dispose 和 ABI bindings。
- Beta 中的 experimental Solid 1.9 + Vite 7 路径已验证 Rust Component、
  callback event、Store action 与 `Accessor` 驱动更新；adapter unit test 覆盖 owner
  cleanup 和 late resolve。该证据不延伸到其他 bundler、SSR 或 hydration。
- Beta 中的 experimental Svelte 5 + Vite 7 路径已验证 Component mount/callback、
  Store action、prop update、`Readable` 声明和 Chromium 运行；同一 fixture 在卸载
  子组件后断言 Component handle 与 generated Store 各执行一次 `dispose()`。该证据
  不延伸到 Svelte 3/4、SvelteKit、SSR/hydration、Vite 8 或其他 bundler/browser。
- `.vooya/types` 中央声明目录、`vooya doctor`、Rust diagnostics 映射和失败恢复。
- Vite 7/8 source-authoring fixture，以及 Rspack/Webpack 的 experimental fixture。
- `rsx!` 的 signal binding、条件分支、keyed loop 和 owned cleanup。
- 100,000-row DataGrid 与 150,000-point Canvas scatter 等浏览器证据。

## 已发布 Beta 的限制

source consumer 仍需要 Cargo、`wasm32-unknown-unknown` 和
`wasm-bindgen-cli`。没有正式预编译 component product；不能宣传 WASM 自动
更快。SSR、hydration、slots、standalone Rust renderer 和 prerelease ABI 稳定性
都不在当前承诺内。Rspack/Webpack 仍需按[兼容性矩阵](./compatibility.md)
逐版本看 evidence。

## 0.2 Alpha 的具名验收范围

Alpha 包提供可选托管 Rust preset、四框架 Vite 8 与四框架
Vite+ 打包用例、Vue/React Rust-file Webpack/Rspack 接入，以及 SSR 安全岛和 Nuxt 用例。
这些能力尚未包含在上面的 npm Beta 包中；具体证据见[兼容性矩阵](./compatibility.md)。

Octane 保留为私有 workspace 实验，延期且不纳入本批公共发布门禁。

0.1 只维护已发布行为，0.2 按功能批次审查和冻结。Go/TinyGo、多语言协议、Rust
服务端 HTML 和保留状态的 Rust HMR 不在本批范围。完整范围和发布工具限制见
[发布线说明](./release-lines.md)；不以当前 main 的 patch Changeset 直接生成 0.1 发布。
完整路线图见[项目状态英文版](../../project/status.md)。
