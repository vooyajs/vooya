# 快速开始

当前路径是“Rust component author”：你在已有 Vue 或 React 应用里写普通
`.rs`，由 Vooya 生成 WASM、框架适配器和声明文件。宿主应用仍然由 JavaScript
工具链负责。

## 前置环境

- Node.js：按所用 Vite 版本选择；Vite 8 的要求是 `^20.19.0 || >=22.12.0`。
- 稳定 Rust toolchain、Cargo。
- `wasm32-unknown-unknown` target。
- `wasm-bindgen-cli` `0.2.115`。

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.115 --locked
npm exec -- vooya doctor
```

当前 source authoring 需要 Rust；预编译 component consumer 尚未成为正式产品。
Windows MSVC 还需要 Visual Studio Build Tools 的 **Desktop development with
C++** 和 Windows SDK。

## Vue 3

```sh
npm install @vooya/vue@alpha
npm install --save-dev @vooya/vite@alpha
```

```ts
import vue from "@vitejs/plugin-vue";
import { vooya } from "@vooya/vite";
import { defineConfig } from "vite";

export default defineConfig({ plugins: [vue(), vooya()] });
```

## React 19

```sh
npm install @vooya/react@alpha
npm install --save-dev @vooya/vite@alpha
```

```ts
import react from "@vitejs/plugin-react";
import { vooya } from "@vooya/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), vooya({ framework: "react" })],
});
```

## 第一个 Rust 组件

创建 `src/Greeting.rs`：

```rust
use wasm_bindgen::JsValue;
use vooya as voo;

#[voo::props]
#[derive(voo::FromJs)]
pub struct GreetingProps { pub name: String }

#[voo::component]
pub fn Greeting(
    view: &voo::View,
    props: GreetingProps,
) -> Result<voo::ViewElement, JsValue> {
    Ok(voo::rsx!(view, <p>{format!("Hello, {}.", props.name)}</p>)?)
}
```

然后在 Vue 或 React 中像普通组件一样导入 `./Greeting.rs`。启动开发服务器或
执行 build 后，生成内容位于 `.vooya/`；TypeScript 项目通常需要：

```json
{
  "compilerOptions": {
    "allowArbitraryExtensions": true,
    "rootDirs": [".", ".vooya/types"]
  }
}
```

最后运行 `npm run dev` 或 `npm run build`。失败时先看
[排错指南](./troubleshooting.md) 和 `npm exec -- vooya doctor`。
