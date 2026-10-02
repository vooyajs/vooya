# 快速开始

在已有的 Vite 应用中接入一个 Rust 组件。先选择你正在使用的框架：

- [Vue 3](#vue)：安装 adapter，配置 Vue 插件。
- [React 19](#react)：安装 adapter，配置 React 插件。

两条路径使用同一个 [Greeting 组件](#first-component)，最后[启动并检查结果](#run)。
本页面向 Vite 7 或 8、Vue `>=3.5.2 <4` 或 React `>=19`，假设应用已有正常工作的
入口与 `dev`、`build` 脚本。如果还没有应用，请先[创建对应框架的 Vite 项目](https://vite.dev/guide/#scaffolding-your-first-vite-project)。

[Solid、Svelte 与其他 bundler](./other-integrations.md) 使用单独的配置入口，选择前请查看支持边界。

## 环境要求 {#prerequisites}

- Node.js 版本符合所用 Vite 的要求；Vite 8 要求 `^20.19.0 || >=22.12.0`。
- 稳定版 Rust 和 Cargo。
- Rust 的 `wasm32-unknown-unknown` target，以及 `wasm-bindgen-cli` `0.2.115`。

Windows 使用 `*-pc-windows-msvc` 工具链时，先安装 Visual Studio Build Tools，勾选
**Desktop development with C++**、MSVC C++ build tools 和 Windows SDK，然后重新打开
终端。Cargo 编译 CLI 需要其中的 `link.exe`。

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.115 --locked
wasm-bindgen --version
```

下面从 `beta` 渠道安装 Vooya，并保留 lockfile。首个 Beta 是 `0.1.0-beta.0`，后续按包
独立发版，内部依赖由发布流程锁定。不要混用未发布的 main 源码与已发布 adapter。
本路径在本地编译 Rust；Vooya 当前不会代为安装 Rust。具体支持范围见[兼容性矩阵](../project/compatibility.md)。

## Vue {#vue}

应用应已安装 `vue`、`vite` 和 `@vitejs/plugin-vue`。


安装依赖：

```sh
npm install @vooya/vue@beta
npm install --save-dev @vooya/vite@beta
```

在 `vite.config.ts` 中把 `vooya()` 放在 Vue 插件之后：

```ts
import vue from "@vitejs/plugin-vue";
import { vooya } from "@vooya/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue(), vooya()],
});
```

pnpm 用户使用 `pnpm add @vooya/vue@beta` 和 `pnpm add --save-dev @vooya/vite@beta`。

接下来[创建 Greeting 组件](#first-component)。

## React {#react}

应用应已安装 `react`、`react-dom`、`vite` 和 `@vitejs/plugin-react`。


安装依赖：

```sh
npm install @vooya/react@beta
npm install --save-dev @vooya/vite@beta
```

在 `vite.config.ts` 中选择 React adapter：

```ts
import react from "@vitejs/plugin-react";
import { vooya } from "@vooya/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), vooya({ framework: "react" })],
});
```

pnpm 用户使用 `pnpm add @vooya/react@beta` 和 `pnpm add --save-dev @vooya/vite@beta`。

接下来[创建 Greeting 组件](#first-component)。

## 创建第一个组件 {#first-component}

创建 `src/Greeting.rs`：

```rust
use wasm_bindgen::JsValue;
use vooya as voo;

#[voo::props]
#[derive(voo::FromJs)]
pub struct GreetingProps {
    pub name: String,
}

#[voo::component]
#[voo::style("./Greeting.css", scoped)]
pub fn Greeting(
    view: &voo::View,
    props: GreetingProps,
) -> Result<voo::ViewElement, JsValue> {
    let label = format!("Hello, {}.", props.name);
    Ok(voo::rsx!(view, <p class="greeting">{label}</p>)?)
}
```

创建相邻的 `src/Greeting.css`：

```css
.greeting {
  font-weight: 600;
}
```

Rust 创建组件的局部内容，宿主仍负责页面和路由。插件会根据 Rust schema 生成 adapter
和类型声明；CSS 由 bundler 处理，不需要手工初始化 WASM。

Vue 用户在 `src/App.vue` 中引用：

```vue
<script setup lang="ts">
import Greeting from "./Greeting.rs";
</script>

<template>
  <Greeting name="world" />
</template>
```

React 用户在 `src/App.tsx` 中引用：

```tsx
import Greeting from "./Greeting.rs";

export default function App() {
  return <Greeting name="Rust" />;
}
```

保留应用已有的 `src/main.ts` 或 `src/main.tsx` 启动入口。

## 检查环境、启动并查看结果 {#run}

TypeScript 项目需要把以下选项合并到应用实际使用的 tsconfig，通常是 `tsconfig.app.json`：

```json
{
  "compilerOptions": {
    "allowArbitraryExtensions": true,
    "rootDirs": [".", ".vooya/types"]
  }
}
```

启动前检查 Rust 工具链：

```sh
npm exec -- vooya doctor
# pnpm: pnpm exec vooya doctor
```

有错误时先修复再继续。Cargo 选择规则和诊断解释见[工具参考](../reference/tooling.md)，
安装或编译失败见[排错指南](./troubleshooting.md)。

先启动开发服务器：

```sh
npm run dev
# pnpm: pnpm run dev
```

打开 Vite 输出的本地地址。Vue 页面应显示加粗的 **Hello, world.**，React 应显示
**Hello, Rust.**。修改宿主中的 `name` prop，确认它能传入 Rust 组件。
首次运行会编译 Rust，可能比后续运行慢；等页面成功显示后，再停止服务器并检查生产构建：

```sh
npm run build
# pnpm: pnpm run build
```

先运行 dev 会生成 `.vooya/types` 中的声明。默认 Vite 模板的 build 可能先执行
`tsc` 或 `vue-tsc`，所以首次接入时要按以上顺序操作。

生成的 Rust crate、WASM、adapter 和声明都在 `.vooya/` 中，可随时清理后重新生成：

```sh
npm exec -- vooya clean
```

## pnpm 安装提示

如果 pnpm 11 提示阻止了 `esbuild` 的安装脚本，再执行：

```sh
pnpm approve-builds esbuild
```

这会允许运行 esbuild 用于检查或安装本机可执行文件的脚本。只在提示被阻止时操作；
可用 `pnpm ignored-builds` 查看当前被阻止的包。

## 下一步

- 只想将状态和计算交给 Rust、保留宿主界面：阅读 [Store](../concepts/store.md)。
- 需要 props、事件、样式等语法：阅读 [Rust 编写](./rust-file-authoring.md)。
- 其他框架或 bundler：查看[其他集成](./other-integrations.md)和[兼容性矩阵](../project/compatibility.md)。
