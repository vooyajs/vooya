# Bundler 指南

Vite 是当前主路径。Rspack 与 Webpack 有 first-party adapter，但仍属于
experimental，不能把一次 fixture 通过理解成完整兼容承诺。

## Vite（主路径）

使用 `@vooya/vite` 的 `vooya()`，Vite 范围为 `>=7 <9`，Vite 8 是当前主要
兼容目标。Vue、React 和 experimental Solid/Svelte 的安装方式见[快速开始](./getting-started.md)；
Solid、Svelte 的已发布 Beta 证据仅覆盖 Vite 7；main 新增的 Vite 8 五框架打包验收尚未发布。

## Rspack / Rsbuild（experimental）

使用 `@vooya/rspack` 的 `vooyaRsbuild()` 或直接配置的 `vooyaRspack()`。
已命名证据使用 Rspack `2.1.10`、Rsbuild `2.1.13`，覆盖 Vue/React 浏览器
fixture 和 Rslib 输出。已发布 beta.0 仍是 legacy `.voo` fixture 路径，不提供普通 `.rs` 接入；SSR、Module Federation 以及更低版本不在承诺内。

## Webpack（experimental）

使用 `@vooya/webpack` 的 `vooyaWebpack()` 和 Webpack 5。已命名 fixture 覆盖
5.101.0、5.109.2、生产输出、生命周期行为和开发恢复。已发布 beta.0 的 loader
仍匹配 legacy `.voo`，不能用它直接导入快速开始的 `.rs` 文件。Webpack 4、SSR、
hydration、Module Federation 和 state-preserving HMR 不在当前边界。

## main 的 Rust-file 路径（未发布）

`npm run test:rust-bundlers` 从源码打包验证 Vue/React 在 Rspack 2.1.10、
Webpack 5.109.2 下的 `.rs` Component、Store、CSS、声明和生命周期；Vue watch
还覆盖失败恢复。这属于 [0.2 候选范围](../project/release-lines.md)，不能通过当前 `@beta` 安装获得。

详细配置见[工具参考](../reference/tooling.md)，具体证据见[兼容性矩阵](../project/compatibility.md)。
