# Component

Vooya Component 是一个拥有局部 DOM 表面的 Rust/WASM capability。适合把编辑器、
Canvas、解析结果视图或数据密集型控件交给 Rust，同时让宿主继续负责页面、路由、
周围状态和 design system。

## Contract

| 部分 | 方向 | 作用 |
| --- | --- | --- |
| Props | Host → Rust | 初始值和声明的更新 |
| Events | Rust → Host | 在 component host 上发送的窄通知 |
| Lifecycle | Host ↔ Rust | `mount`、prop update、错误报告和 `dispose` |
| DOM 与资源 | host 下方由 Rust 拥有 | island 销毁时释放 element、listener 和 subscription |

当前 Rust-file 形式是普通 `.rs` 文件，使用 `#[voo::component]`，并提供明确的
`View`/`ViewElement` 签名；`rsx!` 描述 Rust-owned subtree，不替换宿主 renderer。

工具链先生成包含 component contract 与异步 binding loader 的
framework-neutral bridge，再由 Vue、React、Solid 或 Svelte adapter 接入各自的 component
与 owner lifecycle。这个 bridge 是生成实现边界，不是要求应用作者手写或稳定依赖的
public IR。

## 生命周期与所有权

宿主创建 mount element 并转发声明的 props；Rust 创建 descendants 和自己拥有的
listeners，直到宿主 dispose island。事件使用不冒泡的 `vooya-<name>` transport，
由当前 Vue、React、Solid 或 Svelte adapter 解码。Component 创建的每个资源都必须自己释放，宿主
不拥有 Rust descendants。

Component 适合局部渲染和交互，不适合充当页面路由、全局状态容器或普通宿主布局的
替代品。没有 DOM subtree 的状态能力请使用 [Store](./store.md)。

参见[组件边界](./component-boundary.md)、[Rust 编写指南](../guide/rust-file-authoring.md)
和 [API 参考](../reference/api.md)。
