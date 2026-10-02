# 其他集成

首次接入 Vue 或 React + Vite，请使用[快速开始](./getting-started.md)。以下路径同样需要
[本地 Rust 工具链](./getting-started.md#prerequisites)，支持范围以[兼容性矩阵](../project/compatibility.md)为准。

## Solid 1.9

实验性支持 Solid `>=1.9 <2`，当前验证范围是 Vite 7。


安装依赖：

```sh
npm install @vooya/solid@beta
npm install --save-dev @vooya/vite@beta
```

在 `vite.config.ts` 中把 Vooya 放在 `vite-plugin-solid` 之后：

```ts
import { vooya } from "@vooya/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid(), vooya({ framework: "solid" })],
});
```

可以导入快速开始中的 `Greeting.rs` 并使用 `<Greeting name="Vooya" />`。
Store 通过 accessor 读取，例如 `state()?.count`；完整用法见
[Solid fixture](https://github.com/vooyajs/vooya/tree/main/tests/fixtures/rust-solid)和[Store](../concepts/store.md)。

## Svelte 5

实验性支持 Svelte `>=5 <6`，当前验证范围是 Vite 7。


安装 adapter 与 Vite plugin：

```sh
npm install @vooya/svelte@beta
npm install --save-dev @vooya/vite@beta
```

在 `vite.config.ts` 中把 Vooya 放在 `@sveltejs/vite-plugin-svelte` 之后：

```ts
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { vooya } from "@vooya/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [svelte(), vooya({ framework: "svelte" })],
});
```

在 `.svelte` 文件中导入快速开始的组件：

```svelte
<script>
  import Greeting from "./Greeting.rs";
</script>

<Greeting name="Vooya" />
```

Store state 是 Svelte `Readable`，模板通过 `$state` 读取；callback event 使用
`onEventName` prop。完整用法见[Svelte fixture](https://github.com/vooyajs/vooya/tree/main/tests/fixtures/rust-svelte)。

配置后继续快速开始中的[类型配置和运行检查](./getting-started.md#run)。

## Vite+、Rspack 和 Webpack

- [Vite+ 配置](../../guide/other-integrations.md#vite)：使用同一个 Vite plugin，说明包含已测版本与依赖解析限制。
- [实验性 Rspack 配置](../../guide/other-integrations.md#experimental-rspack-path)：包含 Rsbuild 和直接 Rspack 入口。
- [实验性 Webpack 5 配置](../../guide/other-integrations.md#experimental-webpack-5-path)：包含 loader、CSS 配置和重建行为。

这些路径不能推导出 SSR、hydration 或 Module Federation 支持；请按对应配置页的边界使用。
