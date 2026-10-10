# Rust 编写

Rust-file authoring 是当前 beta 的组件和 store 路径。使用普通 `.rs` 文件、
role attributes 和 `rsx!`；`.voo` 只是已经退休的早期探索格式。

## Vooya 属性标记

Vooya 的属性标记（attribute macros）不是另一套模板语法；它们把普通 Rust 项目标记为
组件或 Store，并让编译器写入版本化 schema，供 bundler 生成 WASM binding、框架模块和
TypeScript 声明。没有标记的普通 Rust 文件仍然只是内部 module。

| 标记 | 应用于 | 作用 | 是否需要配套项 |
| --- | --- | --- | --- |
| `#[voo::component]` | 函数 | 声明一个由 Rust 拥有局部 DOM 子树的 Component | 函数签名必须是 `(&voo::View, Props) -> Result<voo::ViewElement, JsValue>` |
| `#[voo::props]` | struct | 声明宿主传入的 props schema | 通常配合 `#[derive(voo::FromJs)]` |
| `#[voo::events]` | trait | 声明 Rust 发给宿主的事件名和参数 | 组件内部用 `View::emit` 发出事件 |
| `#[voo::store]` | `impl` 块 | 声明无 DOM 的实例级 Store | 必须包含且只包含一个 `#[voo::snapshot]` |
| `#[voo::action]` | Store 方法 | 将同步状态转换暴露给宿主 | 方法参数必须属于 ABI v1 |
| `#[voo::snapshot]` | Store 方法 | 定义宿主读取的快照 | 返回值需要实现 `ToJs + PartialEq` |
| `#[voo::style("./x.css"[, scoped])]` | Component | 声明由 bundler 管理的 CSS 文件 | 可重复；`scoped` 为可选标志 |

属性可以接收 schema 元数据：`id = "..."` 覆盖默认 schema id，`group = "..."` 覆盖
源码分组。例如 `#[voo::store(id = "cart::Cart", group = "cart")]`。大多数项目不需要
手动指定它们，默认值由类型名和文件路径生成。

### Component 标记组合

```rust
use wasm_bindgen::JsValue;
use vooya as voo;

#[voo::props]
#[derive(voo::FromJs)]
pub struct GreetingProps {
    pub name: String,
}

#[voo::events]
pub trait GreetingEvents {
    fn selected(value: u32);
}

#[voo::component]
#[voo::style("./Greeting.css", scoped)]
pub fn Greeting(
    view: &voo::View,
    props: GreetingProps,
) -> Result<voo::ViewElement, JsValue> {
    Ok(voo::rsx!(view, <p>{format!("Hello, {}", props.name)}</p>)?)
}
```

`FromJs` 和 `ToJs` 是 derive macro，不是属性标记：前者把宿主 ABI 值解码为 Rust 类型，
后者把 Rust 值编码为宿主可读的 ABI 值。`#[voo::events]` 只声明事件 schema；实际发送
使用 `view.emit("selected", payload)`，事件仍然是绑定在 Component 宿主上的非冒泡通知。

### Store 标记组合

```rust
#[derive(voo::ToJs, PartialEq, Clone)]
pub struct CartSnapshot {
    pub count: u32,
}

#[derive(Default)]
pub struct Cart {
    count: u32,
}

#[voo::store]
impl Cart {
    #[voo::action]
    pub fn add(&mut self, amount: u32) {
        self.count += amount;
    }

    #[voo::snapshot]
    pub fn snapshot(&self) -> CartSnapshot {
        CartSnapshot { count: self.count }
    }
}
```

`#[voo::store]` 不会创建 DOM，也不会把 Store 变成全局 singleton。bundler 会根据 Store
类型生成 `createCartStore()` 和跨框架同名、同字段的 `useCart()`；`state` 仍保留各框架
原生容器语义。详见 [Store 概念](../concepts/store.md)。

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
| update | 应用声明的 prop patch | Vue/React/Solid/Svelte 触发更新 |
| event | 发出非冒泡 `vooya-*` CustomEvent | 转为 Vue emit 或 React/Solid/Svelte callback |
| dispose | 删除拥有的 DOM、释放资源 | unmount 时丢弃 handle |

事件不是全局 DOM bus。直接通过 `web_sys` 创建的 closure/listener 也必须由
组件自己持有并在 disposal 时释放。

## `rsx!`、props、store

`rsx!` 提供显式 signal binding、事件、条件分支和 keyed loop；异步 action、
SSR、slots 和全局 store 不在 ABI v1。Store 是独立实例，通过 snapshot、
subscribe、action 和 dispose 接入 Vue、React、Solid 或 Svelte。

当 `.rs` 文件包含 `#[voo::store]` 时，四个 first-party adapter 都会生成同名、同字段
的 `useCart()`（名称跟随 Rust 类型名）以及框架无关的 `createCartStore()`：

```vue
<script setup lang="ts">
import { useCart } from "./Cart.rs";

const { state, add } = useCart();
</script>

<template>
  <button type="button" @click="add(1)">{{ state?.count ?? 0 }}</button>
</template>
```

```tsx
import { useCart } from "./Cart.rs";

export function CartButton() {
  const { state, add } = useCart();
  return <button onClick={() => add(1)}>{state?.count ?? 0}</button>;
}
```

Vue 的 `state` 是响应式 `Ref`（template 中会自动解包），React 的 `state` 是当前快照值；
Solid 的 `state` 是 `Accessor`，读取时调用 `state()`。生成名称与 action 字段保持一致，
Svelte 的 `state` 是 `Readable`，模板通过 `$state` 自动订阅。生成名称与 action 字段
保持一致，但响应式容器不会被伪装成同一种类型。需要自己管理共享实例或编写 adapter 时，才使用
对应 adapter 的底层 `useVooyaStore`。

ABI v1 支持有限数字、`bigint`、布尔、owned string、vector、tuple 和 string-key
map；递归 public type、borrowed value、任意 generic 和 TypedArray zero-copy
不在当前边界。完整限制见[英文 ABI RFC](../../rfcs/0007-rust-file-authoring-and-abi-v1.md)。

已发布 alpha.0 中，无法表示字段的派生 struct 声明会退为 `Record<string, unknown>`。
组件声明仍保留这一行为；当前尚未发布的源码会拒绝已解析 Store snapshot 中不受支持
的字段，详见 [Snapshot 诊断](../concepts/store.md)。缺少 schema
时仍使用 `unknown`，不能据此区分合法手写转换与意外缺失的元数据。

未限定的命名类型会优先在所属 Component 或 Store 的 source group 中解析。引用其他
模块的类型时使用 Rust 限定路径，例如 `models::Selection`。同一声明中如果两个已解析
类型短名相同，生成的 TypeScript 会保留模块前缀：`models::Selection` 与
`filters::Selection` 分别成为 `ModelsSelection` 和 `FiltersSelection`；嵌套字段、props、
events 与 Store signature 都使用同一别名。唯一短名保持不变。限定路径找不到匹配的
schema 时生成 `unknown`，不会选用其他模块的同名类型。未限定名称在所属 source group
中无匹配时，当前仍会回退到全局同名候选：唯一候选会被采用，多个候选会报歧义错误。
跨模块引用应使用限定路径，避免把这种回退当作精确的 Rust 类型解析。

当前路径解析只覆盖常规 `.rs` / `mod.rs` source group，以及 `self::`、`super::` 和
`crate::` 路径（`crate::` 需要 `src/` root）。它不是完整 Rust name resolution：`use`
alias、inline module 与 `#[path]` override 仍需要更丰富的 schema metadata；见
[Issue #119](https://github.com/vooyajs/vooya/issues/119)。
