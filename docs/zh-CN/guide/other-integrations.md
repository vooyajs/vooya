# 其他集成

首次接入 Vue 或 React + Vite，请使用[快速开始](./getting-started.md)。以下路径同样需要
[本地 Rust 工具链](./getting-started.md#prerequisites)，支持范围以[兼容性矩阵](../project/compatibility.md)为准。

## Solid 1.9

已发布 Beta 的实验性 Solid `>=1.9 <2` 路径以 Vite 7 为验证基线。
Alpha 另有 Vite 8 和 Vite+ 0.2.9 的打包用例；不要把该证据套用到下面的 `@beta` 安装。


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

已发布 Beta 的实验性 Svelte `>=5 <6` 路径以 Vite 7 为验证基线。
Alpha 另有 Vite 8 和 Vite+ 0.2.9 的打包用例；不要把该证据套用到下面的 `@beta` 安装。


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

## Vite+

::: warning 可选的 0.2 Alpha 配置
使用 `@vooya/vite@0.2.0-alpha.0`，配合 Vue/React alpha.0 或 Solid/Svelte beta.2。
精确安装图见 [Alpha 安装](../project/next-release.md)。具名 tarball 测试说明源码覆盖，
不表示后续 main 或任意 Vite+ 版本已经发布或兼容。
:::

已验证 Vite+ **0.2.9** 和同版本 core alias（实际 Vite **8.2.1**）。保留当前
框架插件及 Vooya adapter，在 `package.json` 中加入：

```json
{
  "scripts": { "dev": "vp dev", "build": "vp build" },
  "devDependencies": {
    "vite-plus": "0.2.9",
    "vite": "npm:@voidzero-dev/vite-plus-core@0.2.9"
  },
  "overrides": {
    "vite": "npm:@voidzero-dev/vite-plus-core@0.2.9",
    "vitest": "4.1.10"
  }
}
```

若直接依赖 Vitest，也将该依赖固定到 `4.1.10`。正常执行 `npm install` 即可，
不需要 `--legacy-peer-deps`。配置中的 `defineConfig` 改从 `vite-plus` 导入：

```ts
import { defineConfig } from "vite-plus";
import vue from "@vitejs/plugin-vue";
import { vooya } from "@vooya/vite";

export default defineConfig({
  plugins: [vue(), vooya({ framework: "vue" })],
});
```

执行 `npm run dev` 或 `npm run build`。React、Solid、Svelte 保留各自的
框架插件和 `framework` 参数。Vite 8 的 Svelte fixture 使用 Svelte plugin 7.1.2；
Octane 保留为私有 workspace 实验，不纳入本轮发布矩阵。

`test:vite-plus-frameworks` 覆盖四框架的 `.rs` 生产构建、浏览器交互、严格声明检查、
开发重建、Rust 错误恢复和宿主组件更新。Rust 编辑仍使用整页刷新，不保留运行状态。
验证范围为固定版本的 dev/build，不代表所有 Vite+ 工具或 SSR 都已支持。
依赖配置依据 [Vite+ 官方迁移规则](https://viteplus.dev/guide/migrate-rules)。

## Rspack 和 Webpack

已发布 beta.0 包仅保留 legacy `.voo` 实验路径；当前 main 新增的普通 `.rs`
接入需要 Alpha 包。新项目可先使用 Vite；Rust-file 示例按 Alpha 精确版本图安装，保留具名实验性边界。

- [实验性 Rspack 配置](../../guide/other-integrations.md#experimental-rspack-path)：包含 Rsbuild 和直接 Rspack 入口。
- [实验性 Webpack 5 配置](../../guide/other-integrations.md#experimental-webpack-5-path)：包含 loader、CSS 配置和重建行为。

这些路径不能推导出 SSR、hydration 或 Module Federation 支持；请按对应配置页的边界使用。
