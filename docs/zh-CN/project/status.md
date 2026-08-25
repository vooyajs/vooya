# 项目状态

Vooya 当前是公开 alpha，也是架构验证项目，不是稳定 compiler 或生产兼容
承诺。最新 coordinated release 是 `v0.1.0-alpha.10`，八个 `@vooya/*` 包应
使用同一个 exact version。

## 当前已验证

- 普通 `.rs` component/store 编译为 application-local WASM。
- Vue 3 与 React 19 的 props、events、Store、lifecycle、dispose 和 ABI bindings。
- 当前源码中的 experimental Solid 1.9 + Vite 7 路径已验证 Rust Component、
  callback event、Store action 与 `Accessor` 驱动更新；adapter unit test 覆盖 owner
  cleanup 和 late resolve。该证据不延伸到其他 bundler、SSR 或 hydration。
- 当前源码中的 experimental Svelte 5 + Vite 7 路径已验证 Component mount/callback、
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
更快。SSR、hydration、slots、standalone Rust renderer 和 alpha ABI 稳定性
都不在当前承诺内。Rspack/Webpack 仍需按[兼容性矩阵](./compatibility.md)
逐版本看 evidence。

下一步重点是更完整的 Rust view layer、state-preserving HMR、结构化 schema
和真实预编译 consumer contract，而不是扩张成另一个 UI framework。完整英文
路线图见[ RFC 0008](../../rfcs/0008-layer-boundary-and-roadmap.md)。
