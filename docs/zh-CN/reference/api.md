# API 参考

本页参数表描述[已发布 Beta](../project/status.md) 的公开 API。main 中的
托管工具链和 SSR 惰性工厂等变化从 0.2.0-alpha.0 起可用；Octane 保留为私有实验，不纳入本轮 0.2。
具体见[发布线说明](../project/release-lines.md)。

这里列的是从包的公开导出和已验证消费路径中整理出的 API。prerelease ABI 可能在
预发布版本间 breaking。没有公开导出的内部 `@vooya/build-core` helper 不在这里
冒充稳定 API。

当前生成的 `.rs` module 会把 framework-neutral Component/Store bridge 交给所选
adapter。这个实现边界用于避免 generation 层出现框架分支，不是承诺给应用作者稳定
依赖的 public IR。普通应用应使用下文的 generated component、`useName()` 与
`createNameStore()`。

相关背景见[工具参考](./tooling.md)、[兼容性矩阵](../project/compatibility.md)
和[英文 ABI v1 RFC](../../rfcs/0007-rust-file-authoring-and-abi-v1.md)。

## `@vooya/vite` 的 `vooya(options?)`

| 导出/参数 | 类型/取值 | 默认值 | 何时使用 | 当前边界/最小例子 |
| --- | --- | --- | --- | --- |
| `vooya()` | `Plugin` | — | 加入 Vite config | Vite `>=7 <9`；`plugins: [vue(), vooya()]` |
| `framework` | `"vue" \| "react" \| "solid" \| "svelte"` | `"vue"` | 选择宿主 adapter | Vue 3、React 19 为 supported；Solid 1.9、Svelte 5 在 Vite 7 上为 experimental |
| `rust.sourceRoot` | `string` | `"src"` | 指定应用根目录下的 Rust 源码目录 | Beta 的点路径匹配有已知缺陷；`"."` / `"rust/."` 修复已在 alpha.0 可用，Beta 回补仍是候选，见[发布线说明](../project/release-lines.md) |
| `rust.entry` | `string` | 未设置；生成模块根 | 指定相对应用根目录的 Rust crate 入口 | 显式入口与 conventional module graph 需可达；它不是 npm package 入口 |
| `rust.files` | `string[]` | `[]` | 添加相对应用根目录的额外 Rust 输入 | 与 sourceRoot 发现的文件一起进入生成构建 |
| `rust.public` | `string[]` | `[]` | 指定相对 sourceRoot 的公开根模块 | 不会把任意 Rust 值自动导出为 JavaScript；仍遵循 Component/Store 契约 |
| `rust.dependencies` | `Record<string, string \| Dependency>` | 就近 `Cargo.toml`，再回退 `{}` | 复用或覆盖 Cargo registry/Git/path crate | 仅 browser-compatible Rust；插件同名项优先 |
| `rust.webSysFeatures` | `string[]` | 就近 `Cargo.toml`，再回退 `[]` | 开启 `web-sys` browser API | 插件显式 features 优先；生成运行时的内建 features 保留 |
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
| `--json` | flag | 关闭 | 输出带版本号的 JSON 诊断报告 | 仅 doctor；自 `@vooya/vite@0.1.0-beta.1` 起支持，beta.0 不支持 |
| `--cargo-path` | 文件路径 | PATH discovery | 指定 doctor 使用的 Cargo | 只对 doctor 有效 |
| `--workspace-root` | 文件路径 | `.vooya/` | 检查 workspace override | doctor 与 clean 均支持 |
| `vooya clean` | CLI command | — | 清理 generated Vooya state | 不删除源码 |

## `@vooya/vue` adapter

### 生成的 `useName(options?)`

Rust-file Store import 会同时生成 `createNameStore()` 和 `useName()`。例如 Rust 类型
为 `Cart` 时，生成 `createCartStore()`、默认导出和 `useCart()`。生成的 hook 是普通
Vue 应用消费 Store 的主入口，返回 `{ state, ...typedActions }`；`state` 是响应式 Ref，
在 template 中会自动解包。

| 导出/参数 | 类型/取值 | 默认值 | 何时使用 | 当前边界/最小例子 |
| --- | --- | --- | --- | --- |
| Generated hook | `useName(options?)` | — | 消费 `#[voo::store]` `.rs` | `const { state, add } = useCart()`；当前生成 action 返回 `void` |
| `options` | `VooyaStoreOptions` | `{}` | 观察创建失败并配置适配器行为 | generated hook 自动拥有并释放实例 |

### `useVooyaStore(source, options?)`（高级 API）

以下类型兼容性修复自 `@vooya/vue@0.1.0-beta.1` 以及
`@vooya/react`、`@vooya/solid`、`@vooya/svelte` 的 `0.1.0-beta.2` 起可用。
更早版本仍要求索引签名，未包含修复。

Store 契约要求 `getSnapshot`、`subscribe` 和 `dispose`，不要求生成的接口声明任意字符串索引。
Vue 可直接接收生成 factory 的 Promise；React、Solid 和 Svelte 接收 factory 与 props，
并从 Store 类型推断 snapshot 和已声明 action 的类型。普通业务代码仍优先使用生成的 `use<Name>` hook。

本节表格描述 Vue 的 `useVooyaStore` 签名。React、Solid 和 Svelte 也导出同名的公共底层 hook，
参数形式见各适配器小节；普通业务代码优先使用生成的 `useName()` hook。使用 Vue Vapor 时，
仍需由宿主自行配置 `createVaporApp` 和 `vaporInteropPlugin`。

| 导出/参数 | 类型/取值 | 默认值 | 何时使用 | 当前边界/最小例子 |
| --- | --- | --- | --- | --- |
| `useVooyaStore` | `(store \| PromiseLike<store>, options?)` | — | 自定义集成或共享实例的生命周期管理 | Vue `>=3.5.2 <4`；不是普通用户的主入口 |
| `source` | `VooyaStore \| PromiseLike<VooyaStore>` | 必填 | 传入 instance 或 generated async store | 组件先 unmount 时会 dispose late instance |
| `disposeOnUnmount` | `boolean` | `false` | 让当前组件拥有 disposal | instance-scoped store 通常设为 `true` |
| `onError` | `(cause: unknown) => void` | — | 接收创建、绑定和通知时的快照读取失败 | 不负责 retry 或隐藏 action error |

`useVooyaStore` 是适配器层 API，不是普通用户的跨框架 Store 入口，也不是 Vapor 专属
API。它适合共享实例、自定义集成和 adapter 作者。返回 `{ snapshot, dispatch,
unsubscribe }`；`dispatch(name, ...args)` 调用声明的 store action。

## `@vooya/react`

生成的 `.rs` import 会暴露组件或 `useCart()` 这类 typed hook。Vue、React、Solid 和 Svelte
获得相同的生成名称与字段：`state` 加类型化 action 参数；React 的 `state` 是当前快照值。
即使 Rust action 有成功返回值，生成 action 当前仍返回 `void`；类型化 action result 由
[Issue #152](https://github.com/vooyajs/vooya/issues/152) 跟踪。

| 导出/参数 | 类型/取值 | 默认值 | 何时使用 | 当前边界/最小例子 |
| --- | --- | --- | --- | --- |
| Generated component | React component props | — | 导入 `#[voo::component]` `.rs` | React `>=19`；`import Counter from "./Counter.rs"` |
| Generated hook | `useName(options?)` | — | 消费 `#[voo::store]` `.rs` | `useSyncExternalStore`；每个 hook 生命周期一个 instance |
| `useVooyaStore` | `(factory, props, options?)` | — | 自定义 adapter 或共享实例集成 | 高级 API；factory 可同步或 Promise |
| `onError` | callback | — | 观察创建和订阅失败 | 不接收 Rust domain event |
| `onNotify` | `(name: string, payload: unknown) => void` | — | custom factory instrumentation | 转发给 custom factory，Solid/Svelte 也提供；不是类型化 generated Store event channel |

`@vooya/react@0.2.0-alpha.1` 将 React Store 的订阅失败交给活跃宿主最新的 `onError`，并将失败实例
清理一次。初始化失败时的清理异常不会覆盖原始错误。实例在卸载后才加载完成时，只做
dispose，不再订阅；延迟错误和 factory 回调不再通知已失效的宿主。这项修复已包含在
[Alpha 更新](../project/next-release.md)中，旧版本保持原有行为。

## `@vooya/solid`

Solid 保持相同的 generated component 与 `useName()` 命名，但由 Solid owner、signal
和 cleanup 包装统一的内部 bridge。由于 WASM Store 异步初始化，`state` 是 accessor。

| 导出/参数 | 类型/取值 | 默认值 | 何时使用 | 当前边界/最小例子 |
| --- | --- | --- | --- | --- |
| Generated component | Solid component props | — | 导入 `#[voo::component]` `.rs` | Solid `>=1.9 <2`；事件使用 `onEventName` callback prop |
| Generated primitive | `useName(options?)` | — | 消费 `#[voo::store]` `.rs` | `const { state, add } = useCart(); state()?.count` |
| `useVooyaStore` | `(factory, props, options?)` | — | 自定义 adapter 或共享实例 | 高级 API；factory 可同步或 Promise |
| `onError` | `(cause: unknown) => void` | — | 观察 Store 创建、绑定和通知时的快照读取失败 | 释放绑定到当前 Solid owner |
| `onNotify` | 转发给 custom factory 的 callback 字段 | — | 高级 factory instrumentation | generated Solid Store 通过 subscription 发布 state，不提供独立 notification bus |

统一 API 不等于强制统一响应式容器：Vue 返回 `Ref`，React 返回 snapshot，Solid 返回
`Accessor`；这些 adapter 的生命周期、action、错误和所有权契约保持对齐。
其中的 `undefined` 都表示异步 WASM Store 尚未 ready。

## `@vooya/svelte`

Svelte 保持相同的 generated component 与 `useName()` 命名，由 Svelte component
lifecycle 包装 framework-neutral bridge。Store `state` 是
`Readable<T | undefined>`，模板通过 `$state` 自动订阅。

| 导出/参数 | 类型/取值 | 默认值 | 何时使用 | 当前边界/最小例子 |
| --- | --- | --- | --- | --- |
| Generated component | Svelte component props | — | 导入 `#[voo::component]` `.rs` | Svelte `>=5 <6`；事件使用 `onEventName` callback prop |
| Generated Store entry | `useName(options?)` | — | 消费 `#[voo::store]` `.rs` | `const { state, add } = useCart()`；模板读取 `$state?.count` |
| `useVooyaStore` | `(factory, props, options?)` | — | 自定义 adapter 或共享实例 | 高级 API；factory 可同步或 Promise |
| `onError` | `(cause: unknown) => void` | — | 观察 Store 创建、绑定和通知时的快照读取失败 | Component 与 generated Store cleanup 绑定 Svelte destruction |
| `onNotify` | 转发给 custom factory 的 callback 字段 | — | 高级 factory instrumentation | generated Svelte Store 通过 `Readable` 发布，不承诺独立 notification bus |

所有 first-party adapter 当前都没有 generated Store 的 domain notification。后续 ABI
需要让 Store 关联显式 event schema，生成类型化 host callback，并保证 notification 的
unsubscribe/dispose 独立于 snapshot subscription；见 [Issue #153](https://github.com/vooyajs/vooya/issues/153)。

当前证据是 Svelte 5 + Vite 7 + Chromium：覆盖 Component mount/callback、Store
action、Component prop update、generated declarations，以及 Component handle 与
generated Store 各一次 cleanup。没有覆盖 Svelte 3/4、SvelteKit、SSR、hydration、
Rspack 或 Webpack。另有 Vite 8 打包源码验收，见[兼容性矩阵](../project/compatibility.md)。

Vue、Solid、Svelte 的 Store 创建、首次 snapshot 读取和订阅失败
统一交给 `onError`，并清空失败的绑定。拥有的实例只释放一次；Vue 自定义来源仍遵守
`disposeOnUnmount`。通知时读取 snapshot 失败会保留最后一次成功的状态，后续通知
仍可恢复。即使 unsubscribe 抛错也会尝试 dispose；初始化失败时的清理错误不会
覆盖原始错误，正常卸载的清理错误交由框架生命周期处理。卸载后才创建完成的实例
直接释放、不再订阅。这些修复已随 Vue `0.2.0-alpha.1` 和 Solid/Svelte `0.2.0-alpha.0` 发布。

## `@vooya/rspack`

普通 Rust 文件接入已随可选的 `0.2.0-alpha.0` 包组合发布。这里描述当前开发线 API，
loader 只匹配 `.rs`；已经发布的旧版本保持原状。迁移要求见[格式退役说明](../project/retired-authoring.md)。

| 导出/参数 | 类型/取值 | 默认值 | 当前边界 |
| --- | --- | --- | --- |
| `vooyaRsbuild(options?)` | `VooyaRsbuildPlugin` | — | Rspack `>=2.1.10`、Rsbuild `>=2.1.13` |
| `vooyaRspack(options?)` | `VooyaRspackPlugin` | — | `plugins: [vooya]` + `vooya.rule()` |
| `framework` | `"vue" \| "react" \| "solid" \| "svelte"` | `"vue"` | Vue/React 有生产浏览器验证；Solid/Svelte 打包器组合尚未验证 |
| `rust`、`workspaceRoot`、`toolchain` | Rust 选项、工作目录、工具链选择 | `{}`、`.vooya/`、auto | 共享依赖并选择系统或托管工具 |
| `rule()` | `{ test: /\.rs$/, loader, options }` | — | 加载有 schema 的 Rust Component/Store 文件 |

## `@vooya/webpack`

| 导出/参数 | 类型/取值 | 默认值 | 当前边界 |
| --- | --- | --- | --- |
| `vooyaWebpack(options?)` | `VooyaWebpackPlugin` | — | Webpack `>=5`；需要普通 framework、CSS 和 async WASM 配置 |
| `framework` | `"vue" \| "react" \| "solid" \| "svelte"` | `"vue"` | Vue/React 有生产浏览器验证；其他组合尚未验证 |
| `rust`、`workspaceRoot`、`toolchain` | Rust 选项、工作目录、工具链选择 | `{}`、`.vooya/`、auto | 共享 Rust 构建选项 |
| `rule()` | `{ test: /\.rs$/, use: [{ loader, options }] }` | — | Rust loader；watch 依赖生成的 runtime marker |

Vue 的 Rust watch 覆盖失败恢复、关联 CSS 修改和新模块。React 生产验证不等于开发服务器
已经完整验收。这些包也不代表 Next.js、SSR、hydration、保留状态的 HMR 或已发布预编译组件产品。
