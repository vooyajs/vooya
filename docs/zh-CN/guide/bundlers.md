# Bundler 指南

Vite 是当前主路径。Rspack 与 Webpack 有 first-party adapter，但仍属于
experimental，不能把一次 fixture 通过理解成完整兼容承诺。

## Vite（主路径）

使用 `@vooya/vite` 的 `vooya()`，Vite 范围为 `>=7 <9`，Vite 8 是当前主要
兼容目标。Vue、React 和 experimental Solid/Svelte 的安装方式见[快速开始](./getting-started.md)；
Solid、Svelte 的现有证据仅覆盖 Vite 7。

## Rspack / Rsbuild（experimental）

使用 `@vooya/rspack` 的 `vooyaRsbuild()` 或直接配置的 `vooyaRspack()`。
已命名证据使用 Rspack `2.1.10`、Rsbuild `2.1.13`，覆盖 Vue/React 浏览器
fixture 和 Rslib 输出。当前仍是 transitional fixture 路径，尚未证明与
Rust-file Vite 路径 parity；SSR、Module Federation 以及更低版本不在承诺内。

## Webpack（experimental）

使用 `@vooya/webpack` 的 `vooyaWebpack()` 和 Webpack 5。已命名 fixture 覆盖
5.101.0、5.109.2、生产输出、生命周期行为和开发恢复。Webpack 4、SSR、
hydration、Module Federation 和 state-preserving HMR 不在当前边界。

详细配置见[工具参考](../reference/tooling.md)，具体证据见[兼容性矩阵](../project/compatibility.md)。
