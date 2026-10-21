# 旧源码格式退役

当前开发线统一使用普通 Rust `.rs` Component 和 Store，移除了 `.voo` parser、
formatter、旧编译分支、bundler loader 和旧声明生成。示例和验收 fixture 使用 Rust
源码。历史发布版本和 changelog 保持原状；本轮改动尚未发布。

## 应用迁移

1. 用 `#[vooya::props]`、`#[derive(vooya::FromJs)]` 声明 props，用
   `#[vooya::events]` 声明事件，用 `#[vooya::component]` 声明根函数。
   Store 使用 `#[vooya::store]`。仅改扩展名不能完成语法迁移。
2. 将样式移到普通 CSS 文件，通过 `#[vooya::style("./Counter.css", scoped)]` 引用。
3. 宿主改为导入 `./Counter.rs`；声明仍放在 `.vooya/types`。按[快速开始](../guide/getting-started.md)
   配置 `allowArbitraryExtensions` 和 `rootDirs`。
4. 可选 props 使用 `Option<T>`，默认值在 Rust 内显式处理。需要在 props 更新时保留
   实例状态时，使用已有的原地更新 hook；资源清理由返回的根节点拥有。
5. 删除旧格式源码及其生成声明，运行 `vooya clean` 后重建。Rust 格式化使用 `rustfmt`。

具体契约见 [Rust 文件编写](../guide/rust-file-authoring.md)。Webpack/Rspack 的 Rust
路径需要已文档化的可选 0.2 alpha 包组合；旧 beta 集成不能消费普通 Rust 文件。

## 已移除入口

- `voo-format`、`@vooya/vite/format` 及仓库旧格式化命令。
- `@vooya/compiler` 的自定义格式 parser、formatter、Rust binding 和声明生成 API。
- Rust provider/build-core 的 `buildApplication({ components })` 和 `writeVooDeclarations`。
  声明改由 Rust schema 和 `writeRustSchemaDeclarations` 生成。
- Vite、Webpack、Rspack 的旧格式处理；loader rule 只匹配 `.rs`。

`@vooya/compiler` 保留共享 ABI 和作用域样式辅助函数。`voo_abi_version`、
`__voo_schema`、`use vooya as voo` 是内部 ABI 名称或 Rust 简写，不是旧源码格式。

当前开发线也已移除专用预编译 Vue 组件包 helper。普通 `.rs` 导入继续使用原有构建
和适配链路；需要分发组件时，由作者自行组织 JS/WASM wrapper 和 npm 元数据。详见
[组件包实验退役记录](../../rfcs/0006-precompiled-vue-artifacts.md)。
