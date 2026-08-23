# Rust 编写

Rust-file authoring 是当前 alpha 的组件和 store 路径。使用普通 `.rs` 文件、
role attributes 和 `rsx!`；`.voo` 只是已经退休的早期探索格式。

## Roles 与边界

`#[voo::component]` 描述组件，`#[voo::props]` 和 `#[voo::events]` 描述它的
宿主契约，`#[voo::store]` 描述 instance-scoped store。普通未标注 Rust 文件
仍可作为内部 module。

```rust
#[voo::props]
#[derive(voo::FromJs)]
pub struct CounterProps { pub initial: i32 }

#[voo::component]
pub fn Counter(
    view: &voo::View,
    props: CounterProps,
) -> Result<voo::ViewElement, wasm_bindgen::JsValue> {
    voo::rsx!(view, <button>{props.initial}</button>)
}
```

## 生命周期与事件

| 阶段 | Rust 侧 | 宿主侧 |
| --- | --- | --- |
| mount | 创建状态、DOM 和 listener | 创建 host 并传入初始 props |
| update | 应用声明的 prop patch | Vue/React 触发更新 |
| event | 发出非冒泡 `vooya-*` CustomEvent | 转为 Vue emit 或 React callback |
| dispose | 删除拥有的 DOM、释放资源 | unmount 时丢弃 handle |

事件不是全局 DOM bus。直接通过 `web_sys` 创建的 closure/listener 也必须由
组件自己持有并在 disposal 时释放。

## `rsx!`、props、store

`rsx!` 提供显式 signal binding、事件、条件分支和 keyed loop；异步 action、
SSR、slots 和全局 store 不在 ABI v1。store 是独立实例，通过 snapshot、
subscribe、action 和 dispose 接入 Vue/React。

ABI v1 支持有限数字、`bigint`、布尔、owned string、vector、tuple 和 string-key
map；递归 public type、borrowed value、任意 generic 和 TypedArray zero-copy
不在当前边界。完整限制见[英文 ABI RFC](../../rfcs/0007-rust-file-authoring-and-abi-v1.md)。
