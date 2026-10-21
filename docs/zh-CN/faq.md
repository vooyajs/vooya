# FAQ

## 用户需要安装 Rust 吗？

已发布 Beta 的 source-authoring 路径需要 Cargo、稳定 Rust、`wasm32-unknown-unknown`
和 `wasm-bindgen-cli 0.2.115`。可选托管 preset 已作为
`@vooya/preset@0.2.0-alpha.0` 发布，需显式选择 Alpha；它仍需宿主 SDK/linker，
也不等于物理上不安装 Rust 的机器已经得到完整认证。当前开发线已移除专用的组件包
builder 和 Vue 消费 fixture；组件作者自行组织 JS/WASM 入口、资源、声明与 npm
元数据。preset 只负责固定工具链，详见[退役记录](../rfcs/0006-precompiled-vue-artifacts.md)。

## TypeScript 是用户依赖吗？

不需要专门安装 TypeScript 才能运行 Vooya 包。仓库用 TypeScript 构建工具；
消费者若使用 TS，只需让自己的 `tsconfig` 读取 `.vooya/types`。

## `.vooya/` 是什么？

它是应用级 generated workspace，保存 Cargo build、WASM、声明、cache 和 metadata。
默认不应手工编辑或提交；用 `vooya clean` 清理。

## `.voo` 怎么了？

当前开发线已经移除自定义格式、parser、formatter 和旧 loader 分支。组件和 Store
统一使用普通 `.rs`、role attributes 和独立 CSS。历史发布版本保持原状，
迁移方法见[格式退役说明](./project/retired-authoring.md)。

## Webpack/Rspack 支持吗？

可选的 0.2 alpha 已有普通 Rust 文件接入，并验证了 Vue/React 生产路径和 Vue watch
失败恢复。其他 framework/watch 组合仍未完整验收，所以标为实验性；不是空包或仅有设计。
Vite 仍是主路径，详见[兼容性矩阵](./project/compatibility.md)。

## 已发布 Beta 有哪些 framework adapter？

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
experimental Solid/Svelte 路径。main 已有延期的 Octane 私有实验，以及具名 Nuxt SSR 安全岛用例；
它们不属于当前 npm Beta，见[发布线说明](project/release-lines.md)。其他框架仍需独立证据。

更多英文 FAQ 见[FAQ](../faq.md)。
