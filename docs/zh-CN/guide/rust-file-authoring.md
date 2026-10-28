# Rust 编写

Rust-file authoring 是当前 beta 的组件和 store 路径。使用普通 `.rs` 文件、
role attributes 和 `rsx!`。当前开发线只接受普通 Rust 文件；
旧格式迁移见[退役说明](../project/retired-authoring.md)。

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

### 失败的 action 会保留之前的状态变更

一个可失败的 action 可以先修改 snapshot，再返回错误：

```rust
use wasm_bindgen::JsValue;

#[voo::action]
pub fn checked_add(&mut self, amount: u32, fail: bool) -> Result<(), JsValue> {
    self.count += amount;
    if fail { Err(JsValue::from_str("action failed")) } else { Ok(()) }
}
```

action 边界也接受完整限定形式
`std::result::Result<(), JsValue>` 和 `::core::result::Result<(), JsValue>`。
这些是该 result 形状支持的路径写法；这不表示系统会解析任意类型别名。

生成的宿主 action 收到 `Err` 时会抛出错误，但错误之前的状态变更仍然可见。
成功的 action 返回值目前仍是 `void`：

```js
import createCartStore from "./Store.rs";

const store = await createCartStore();
let notifications = 0;
const unsubscribe = store.subscribe(() => notifications++);

const success = store.checked_add(2, false);
try {
  store.checked_add(3, true);
} catch (error) {
  console.log(String(error));
}

console.log(success); // undefined
console.log(store.getSnapshot().count); // 5
console.log(notifications); // 2

try {
  store.checked_add(0, true);
} catch {}
console.log(notifications); // 仍为 2：snapshot 没有变化

unsubscribe();
store.dispose();
```

只有 snapshot 发生变化时才会通知 subscriber，即使 action 随后返回 `Err` 也是如此。
如果 snapshot 没有变化，单独的错误不会产生通知。成功 action 的返回值目前仍为 `void`；
更丰富的 result 值由 [Issue #152](https://github.com/vooyajs/vooya/issues/152) 跟踪。

ABI v1 支持有限数字、`bigint`、布尔、owned string、vector、tuple 和 string-key
map；递归 public type、borrowed value、任意 generic 和 TypedArray zero-copy
不在当前边界。完整限制见[英文 ABI RFC](../../rfcs/0007-rust-file-authoring-and-abi-v1.md)。

`#[voo::events]` 当前只声明 Component callback。Store 还不能将该 trait 关联到生成的
Rust 到宿主 notification，`useCart()` 也不接受生成的 `onEventName` callback。runtime
内部 domain listener 并不是公开 Store event API；类型化 payload、订阅 cleanup 和生成的
host callback 由 [Issue #153](https://github.com/vooyajs/vooya/issues/153) 跟踪。

action 当前不会把 Rust 的成功返回值暴露给生成的宿主 API。wrapper 会丢弃非 unit 成功值，
因此 generated action declaration 返回 `void`。支持 owned value 和 `Result<T, JsValue>`
的受限 result ABI 由 [Issue #152](https://github.com/vooyajs/vooya/issues/152) 跟踪。

Schema v2 通过实际的 `FromJs` / `ToJs` 转换类型，让 Rust 编译器解析 ABI 字段、
event 参数、action 参数和 snapshot。`use` alias、type alias、inline module 与
`#[path]` 布局都保留实际的 Rust 类型身份，不再用源码文件名或短名称猜测类型。

每份声明只生成可达类型。同名类型使用模块前缀区分，例如 `ModelsSelection` 与
`FiltersSelection`；命名不依赖 schema 记录顺序。同一个 Rust 类型只有在输入、输出的
整个可达形状一致时才合并声明，否则分别生成 `Input` / `Output` 名称。

手写转换默认提供 opaque 元数据，对应位置生成 `unknown`，外围容器仍保留类型。
输入 derive 不会被当成手写输出的形状。明确的类型引用如果缺失记录，会报错，不会采用
其他同名类型。Store snapshot 中不支持的字段和递归仍报告 Rust 源码位置，并保留上次
成功输出，详见 [Snapshot 诊断](../concepts/store.md)。ABI v1 的 owned、非泛型边界不变。

**0.2 alpha 迁移：** 一起更新 `@vooya/core` 与 `@vooya/provider-rust`，重新构建产物。
新 provider 兼容读取旧 schema v1；旧 provider 会拒绝 v2。运行时 ABI 版本仍为 1。
`ToJs` 新增默认元数据关联常量，因此不再支持 `dyn ToJs`；已有具体类型的手写实现不需要
补成员。将 trait object 边界改成 `T: ToJs` 泛型，或应用自己的 object-safe 转换接口。
Component 的同文件 props/events 归属规则不变。本次解决 ABI 值类型解析，不扩展注册机制。
更多细节见[英文 schema v2 设计](../../contribute/rust-schema.md)。
