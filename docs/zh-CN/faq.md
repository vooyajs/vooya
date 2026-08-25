# FAQ

## 用户需要安装 Rust 吗？

当前 source-authoring 路径需要 Cargo、稳定 Rust、`wasm32-unknown-unknown`
和 `wasm-bindgen-cli 0.2.115`。预编译消费者未来可能不需要，但正式产品尚未发布。

## TypeScript 是用户依赖吗？

不需要专门安装 TypeScript 才能运行 Vooya 包。仓库用 TypeScript 构建工具；
消费者若使用 TS，只需让自己的 `tsconfig` 读取 `.vooya/types`。

## `.vooya/` 是什么？

它是应用级 generated workspace，保存 Cargo build、WASM、声明、cache 和 metadata。
默认不应手工编辑或提交；用 `vooya clean` 清理。

## `.voo` 怎么了？

`.voo` 是验证 island model 时的中间探索格式，已经退休；新组件使用普通
`.rs`、role attributes 和 `rsx!`。

## Webpack/Rspack 支持吗？

有 experimental first-party adapter。Vite 是主路径；Rspack 证据下限为 2.1.10，
Webpack 为 5，未列版本、SSR、hydration、Turbopack 等都不能推断支持。

## 当前有哪些 framework adapter？

Vue `>=3.5.2 <4`、React `>=19` 是 supported first-party adapter。Solid
`>=1.9 <2`、Svelte `>=5 <6` 是 Vite 7 Rust-file 路径上的 experimental adapter。
Svelte fixture 已覆盖子组件卸载后的 Component/Store cleanup；两条 experimental
路径都不能据此推断 Rspack/Webpack、SSR、hydration、meta-framework 或更多浏览器
已经支持。

这些 adapter 的 `useName()` 保持生成名称和字段一致，但不会伪装成同一种响应式容器：
Vue 返回 `Ref`，React 返回 snapshot，Solid 返回 `Accessor`，Svelte 返回在模板中
以 `$state` 消费的 `Readable`。

## Vooya 保证更快吗？

不保证。它解决的是 Rust 能力复用、ownership 和集成边界；请对真实 workload
与宿主基线测量。

## 能否接入其他 Web 框架？

架构目标是框架无关的 Web↔WASM layer。当前 adapter 证据覆盖 Vue、React，以及
experimental Solid/Svelte 路径；其他框架需要独立 adapter 和证据，不能推断已支持。

更多英文 FAQ 见[FAQ](../faq.md)。
