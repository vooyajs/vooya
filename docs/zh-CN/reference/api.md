# API 参考

这里列的是从包的公开导出和已验证消费路径中整理出的 API。alpha ABI 可能在
预发布版本间 breaking。没有公开导出的内部 `@vooya/build-core` helper 不在这里
冒充稳定 API。

相关背景见[工具参考](./tooling.md)、[兼容性矩阵](../project/compatibility.md)
和[英文 ABI v1 RFC](../../rfcs/0007-rust-file-authoring-and-abi-v1.md)。

## `@vooya/vite` 的 `vooya(options?)`

| 导出/参数 | 类型/取值 | 默认值 | 何时使用 | 当前边界/最小例子 |
| --- | --- | --- | --- | --- |
| `vooya()` | `Plugin` | — | 加入 Vite config | Vite `>=7 <9`；`plugins: [vue(), vooya()]` |
| `framework` | `"vue" \| "react"` | `"vue"` | 选择宿主 adapter | Vue 3 或 React 19；`vooya({ framework: "react" })` |
| `rust.dependencies` | `Record<string, string \| Dependency>` | `{}` | 复用 Cargo registry/Git/path crate | 仅 browser-compatible Rust；`rust: { dependencies: { serde: "1" } }` |
| `rust.webSysFeatures` | `string[]` | `[]` | 开启 `web-sys` browser API | 用它添加 feature，不要覆盖生成的 `web-sys` |
| `toolchain.cargoPath` | `string` | PATH discovery | 指定 Cargo | 该 Cargo 的 rustc、target、CLI 必须一致 |
| `workspace.root` | `string` | `.vooya/` | 把 generated state 放到别处 | 也要同步 TS `rootDirs`；workspace 可重新生成 |

```ts
import { vooya } from "@vooya/vite";
vooya({ framework: "vue", toolchain: { cargoPath: "/opt/rust/bin/cargo" } });
```

## `vooya doctor` / `vooya clean`

| 命令/参数 | 类型/取值 | 默认值 | 何时使用 | 当前边界/最小例子 |
| --- | --- | --- | --- | --- |
| `vooya doctor` | CLI command | — | 检查 Cargo、rustc、target、wasm-bindgen、linker 和 types | 只诊断，不安装 toolchain |
| `--cargo-path` | 文件路径 | PATH discovery | 指定 doctor 使用的 Cargo | 只对 doctor 有效 |
| `--workspace-root` | 文件路径 | `.vooya/` | 检查 workspace override | doctor 与 clean 均支持 |
| `vooya clean` | CLI command | — | 清理 generated Vooya state | 不删除源码 |

## `@vooya/vue` adapter：`useVooyaStore`

下面以 Vue adapter 为例。`useVooyaStore` 是 Vue 专用 composable，不是跨框架的
Vooya 通用 API，也不是 Vapor 专属 API；React 请使用 `@vooya/react` 导出的独立
hook。使用 Vue Vapor 时，仍需由宿主自行配置 `createVaporApp` 和
`vaporInteropPlugin`。

| 导出/参数 | 类型/取值 | 默认值 | 何时使用 | 当前边界/最小例子 |
| --- | --- | --- | --- | --- |
| `useVooyaStore` | `(store \| PromiseLike<store>, options?)` | — | 在 Vue 中镜像 Rust store snapshot | Vue `>=3.5.2`；`useVooyaStore(store)` |
| `source` | `VooyaStore \| PromiseLike<VooyaStore>` | 必填 | 传入 instance 或 generated async store | 组件先 unmount 时会 dispose late instance |
| `disposeOnUnmount` | `boolean` | `false` | 让当前组件拥有 disposal | instance-scoped store 通常设为 `true` |
| `onError` | `(cause: unknown) => void` | — | 接收异步创建失败 | 不负责 retry 或隐藏 action error |

返回 `{ snapshot, dispatch, unsubscribe }`。`dispatch(name, ...args)` 调用声明的
store action；异步 action 不在 ABI v1。

## `@vooya/react`

生成的 `.rs` import 会暴露组件或 `useCart()` 这类 typed hook；包本身还导出供
generated integration 使用的底层 helper。React 的 `useVooyaStore` 是独立的
React adapter hook，不应与上面的 Vue composable 混用。

| 导出/参数 | 类型/取值 | 默认值 | 何时使用 | 当前边界/最小例子 |
| --- | --- | --- | --- | --- |
| Generated component | React component props | — | 导入 `#[voo::component]` `.rs` | React `>=19`；`import Counter from "./Counter.rs"` |
| Generated hook | `useName(props, options?)` | — | 消费 `#[voo::store]` `.rs` | `useSyncExternalStore`；每个 hook 生命周期一个 instance |
| `useVooyaStore` | `(factory, props, options?)` | — | 自定义 store adapter | factory 可同步或 Promise；late store 会 dispose |
| `onError` / `onNotify` | callbacks | — | 观察创建失败/通知 | adapter callback，不是全局 event bus |

## `@vooya/rspack`

alpha.10 的 Rspack 和 Webpack 实现仍为 experimental fixture 暴露 legacy `.voo`
loader rule。`.voo` 已作为新 authoring format 退休并计划移除；在这些 adapter
完成迁移前，请使用主要的 Vite Rust-file 路径。

| 导出/参数 | 类型/取值 | 默认值 | 何时使用 | 当前边界/最小例子 |
| --- | --- | --- | --- | --- |
| `vooyaRsbuild(options?)` | `VooyaRsbuildPlugin` | — | 接入 Rsbuild | Experimental；Rspack `>=2.1.10`、Rsbuild `>=2.1.13` |
| `vooyaRspack(options?)` | `VooyaRspackPlugin` | — | 直接配置 Rspack | Experimental；`plugins: [vooya]` + `vooya.rule()` |
| `framework` | `"vue" \| "react"` | `"vue"` | 选择宿主 adapter | 当前 fixture 仍是 transitional `.voo`；未宣称 Rust-file parity |
| `rust`、`workspaceRoot` | Rust options、文件路径 | `{}`、`.vooya/` | 共享依赖或移动 generated state | Experimental adapter options |
| `rule()` | `{ test: /\.voo$/, loader, options }` | — | 直接 Rspack 加 source loader | 针对 transitional `.voo` fixture |

## `@vooya/webpack`

| 导出/参数 | 类型/取值 | 默认值 | 何时使用 | 当前边界/最小例子 |
| --- | --- | --- | --- | --- |
| `vooyaWebpack(options?)` | `VooyaWebpackPlugin` | — | 接入 Webpack 5 | Experimental；Webpack `>=5` |
| `framework` | `"vue" \| "react"` | `"vue"` | 选择宿主 adapter | 当前 fixture 仍是 transitional `.voo`；未宣称 Rust-file parity |
| `rust`、`workspaceRoot` | Rust options、文件路径 | `{}`、`.vooya/` | 共享依赖或移动 generated state | Experimental adapter options |
| `rule()` | `{ test: /\.voo$/, use: [{ loader, options }] }` | — | 接入 Webpack source loader | 还需要正常 framework、CSS 和 async WASM 配置 |

当前没有公开 Web Components、预编译 artifact consumer、SSR、hydration 或
通用 renderer API。
