# 快速开始

Vooya 的使用顺序很简单：在 Rust 中编写一个局部 Component，配置宿主应用的 bundler，
然后在 Vue 或 React 中像使用普通组件一样导入它。页面、路由和周围的业务状态仍由宿主
应用负责，Rust 只拥有这个局部能力边界。

当前主路径是 Vite `>=7 <9`，Vue `>=3.5.2` 或 React `>=19`。Rust-file component
会在应用作者的机器上编译，因此需要同时准备 Node.js 和 Rust 工具链。

## 1. 准备环境

- Node.js：按所用 Vite 版本选择；Vite 8 要求 `^20.19.0 || >=22.12.0`。
- 稳定版 Rust toolchain 和 Cargo。
- Rust target：`wasm32-unknown-unknown`。
- `wasm-bindgen-cli`：当前 alpha 使用 `0.2.115`。

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.115 --locked
```

如果 Windows 上使用的是 Rust 的 `*-pc-windows-msvc` toolchain，除了 Rust 本身，还需要
安装 Visual Studio Build Tools。安装器中请勾选 **Desktop development with C++** 工作负载，
并确认包含 MSVC C++ build tools 和 Windows SDK；它们会提供 Cargo 编译所需的
MSVC linker（`link.exe`）。这里只说“MSVC”并不代表安装一个单独的运行库就足够。

这是当前 source authoring alpha 的现实前置条件。Vooya 后续会持续减少 Rust、WASM 和
平台 linker 的手工配置，朝更接近开箱即用的体验演进；未来可能通过预编译产物、自动
诊断和更完善的工具链管理降低门槛，但当前版本不会替用户安装 Rust 或 Visual Studio。

## 2. 编写第一个 Rust Component

在项目中创建 `src/Greeting.rs`：

```rust
use wasm_bindgen::JsValue;
use vooya as voo;

#[voo::props]
#[derive(voo::FromJs)]
pub struct GreetingProps {
    pub name: String,
}

#[voo::component]
pub fn Greeting(
    view: &voo::View,
    props: GreetingProps,
) -> Result<voo::ViewElement, JsValue> {
    let label = format!("Hello, {}.", props.name);
    Ok(voo::rsx!(view, <p>{label}</p>)?)
}
```

这里的几个标记分别表示：

| 标记 | 作用 |
| --- | --- |
| `#[voo::props]` | 声明宿主可以传入的 props 结构 |
| `#[derive(voo::FromJs)]` | 生成从 JavaScript 值到 Rust props 的转换 |
| `#[voo::component]` | 声明这是一个可被宿主导入的 Component |
| `voo::rsx!` | 描述由 Rust 拥有的局部 DOM 子树 |

Rust Component 不负责页面布局、路由或整个应用的渲染；它只创建自己的局部内容。

## 3. 配置宿主应用的 bundler

下面两种配置都基于已有的 Vite 项目。选择你正在使用的宿主框架，并保持 Vooya
相关包使用相同的 alpha 版本。

### Vue 3

安装依赖：

```sh
npm install @vooya/vue@alpha
npm install --save-dev @vooya/vite@alpha
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

### React 19

安装依赖：

```sh
npm install @vooya/react@alpha
npm install --save-dev @vooya/vite@alpha
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

## 4. 在应用入口导入并消费

### Vue 应用

在 `src/App.vue` 中导入 Rust Component：

```vue
<script setup lang="ts">
import Greeting from "./Greeting.rs";
</script>

<template>
  <main>
    <h1>我的 Vue 应用</h1>
    <Greeting name="Vooya" />
  </main>
</template>
```

你的 `src/main.ts` 仍然使用标准 Vue 启动方式：

```ts
import { createApp } from "vue";
import App from "./App.vue";

createApp(App).mount("#app");
```

### React 应用

在 `src/App.tsx` 中导入 Rust Component：

```tsx
import Greeting from "./Greeting.rs";

export default function App() {
  return (
    <main>
      <h1>我的 React 应用</h1>
      <Greeting name="Vooya" />
    </main>
  );
}
```

你的 `src/main.tsx` 仍然使用标准 React 启动方式：

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

对宿主应用来说，`Greeting.rs` 的使用方式和普通 Vue/React Component 一样；不需要在
页面中手动调用 WASM 初始化函数，也不需要自己编写 mount、事件监听或销毁逻辑。

## 5. 启动、构建与类型配置

先检查 Vooya 将要使用的 Rust 工具链：

```sh
npm exec -- vooya doctor
```

TypeScript 项目需要让 `tsc` 和编辑器能够找到 Vooya 生成的声明文件。将以下选项合并
到项目实际使用的 tsconfig（新建 Vite 项目通常是 `tsconfig.app.json`）：

```json
{
  "compilerOptions": {
    "allowArbitraryExtensions": true,
    "rootDirs": [".", ".vooya/types"]
  }
}
```

然后运行宿主应用自己的脚本：

```sh
npm run dev
npm run build
```

生成的应用本地 Rust crate、WASM、框架适配器和 TypeScript 声明位于 `.vooya/`。这些
都是可重新生成的状态，可以使用以下命令清理：

```sh
npm exec -- vooya clean
```

如果构建失败，请先查看[排错指南](./troubleshooting.md)，再运行
`npm exec -- vooya doctor` 检查工具链。需要 Store 时，参见 [Store 概念](../concepts/store.md)；
需要更完整的 Rust role 语法时，参见 [Rust 编写](./rust-file-authoring.md)。
