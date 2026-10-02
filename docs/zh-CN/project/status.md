# 项目状态

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

## 当前已验证

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

## 当前限制

source consumer 仍需要 Cargo、`wasm32-unknown-unknown` 和
`wasm-bindgen-cli`。没有正式预编译 component product；不能宣传 WASM 自动
更快。SSR、hydration、slots、standalone Rust renderer 和 prerelease ABI 稳定性
都不在当前承诺内。Rspack/Webpack 仍需按[兼容性矩阵](./compatibility.md)
逐版本看 evidence。

owned struct/unit enum 的命名类型声明、作用域名称消歧，以及 `rsx!` 条件/键控
渲染已经落地。下一步是 Solid/Svelte 的独立消费验收、更多真实组件场景、
state-preserving HMR、更完整的 Rust 类型解析和预编译产品契约。
`@vooya/preset` 托管工具链安装留在 [0.2 工作流](https://github.com/vooyajs/vooya/issues/129)。
完整路线图见[项目状态英文版](../../project/status.md)。
