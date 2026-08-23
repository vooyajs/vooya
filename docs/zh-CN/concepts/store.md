# Store

Vooya Store 是一个无 DOM 的 Rust/WASM 状态能力。它拥有实例级状态、快照、订阅、
声明的动作和释放语义，但不拥有页面或 DOM 子树。

本文中的“宿主”统一指承载 Vooya 的现有 Web 应用及其渲染器（renderer）。英文资料和 API 名称
中可能仍出现 `host`，但中文正文统一使用“宿主”。宿主负责页面、路由和周围的业务状态；
Store 负责一块可以由 Rust 可靠维护、又能被多个宿主视图消费的状态或计算能力。

## 从 Rust 到宿主

下面用一个购物车说明完整路径：在 Rust 中声明 Store，Vooya 生成可导入的模块，Vue 或
React 适配器（adapter）再把同一个 Store 契约接入各自的响应式系统。

### 1. 在 Rust 中编写 Store

将文件保存为 `Cart.rs`：

```rust
use vooya as voo;

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

`#[voo::store]` 声明 Store 的公开边界，`#[voo::snapshot]` 定义宿主读取的状态形状，
`#[voo::action]` 定义宿主可以调用的同步动作。当前 ABI v1 从 Rust 的 `Default` 创建
实例；构造参数和异步动作暂不属于这一版边界。

### 2. 在 Vue 中使用

将 `.rs` 文件交给 Vooya bundler 适配器后，它会生成 `createCartStore` 和 `useCart`。
Vue 和 React 都优先使用生成的 `useCart`，在组件卸载时释放这个 hook 自己创建的实例：

```vue
<script setup lang="ts">
import { useCart } from "./Cart.rs";

const { state, add } = useCart();
</script>

<template>
  <button type="button" @click="add(1)">
    Store {{ state?.count ?? 0 }}
  </button>
</template>
```

`useCart` 的名字来自 Rust Store 类型 `Cart`，不是文件名；如果类型名是
`ShoppingCart`，生成的 hook 就是 `useShoppingCart`。这是普通 Vue/React 用户的主入口。

### 3. 在 React 中使用

同一个 `Cart.rs` 在 React 中也生成同名、同 shape 的类型化 `useCart` hook。该 hook 通过
React 的 `useSyncExternalStore` 接入渲染：

```tsx
import { useCart } from "./Cart.rs";

export function CartButton() {
  const { state, add } = useCart();
  const count = state?.count ?? 0;

  return (
    <button type="button" onClick={() => add(1)}>
      Store {count}
    </button>
  );
}
```

Vue 的 `state` 是响应式 `Ref`（在 template 中会自动解包），React 的 `state` 是当前
快照值；这是框架实现差异，不改变公开字段和动作 shape。需要自己管理实例、共享 Store
或编写 adapter 时，才使用 `@vooya/vue` 或 `@vooya/react` 导出的底层 `useVooyaStore`。

## 稳定契约与框架适配

Vue 和 React 的生成便利 API 现在保持同一个公开 shape；内部响应式和生命周期实现可以
不同，但两者消费的是同一个 Store 对象、ABI、通知顺序和释放语义。

| 层级 | 是否跨框架 | 说明 |
| --- | --- | --- |
| Rust Store schema / ABI | 是 | 快照、订阅、声明动作和 `dispose()` |
| `createCartStore()` | 是 | 返回相同的 Store 对象契约；模块加载可以是异步的 |
| 生成的 `useCart()` | 是（公开 shape） | 返回 `state` 和类型化 action；内部接入当前框架的响应式系统 |
| `useVooyaStore` | 否（高级 API） | 供自定义集成、共享实例和 adapter 作者管理底层生命周期 |

跨框架真正稳定的边界是：

- `getSnapshot()`：读取当前快照；
- `subscribe(listener)`：监听快照变化并可取消订阅；
- 声明的同步 action：执行 Rust 拥有的状态转换；
- `dispose()`：释放订阅、listener 和其他由实例拥有的资源。

因此，当前设计不是“每个框架各自定义一套 Store”。alpha 阶段先保持框架特有的消费
层，以保证各自的生命周期语义正确；后续如果需要统一开发者体验，可以在共享 Store
契约之上增加命名一致的生成式便利 API，但不能牺牲框架正确的生命周期处理。

## 所有权与释放

Store 默认是实例级的。一个 Component 或宿主服务可以拥有一个 Store；多个消费者也可以
共享它，但必须由独立的所有者（owner）负责生命周期。Vue 的 `disposeOnUnmount` 是显式选项；React
生成的 hook 会在自己创建的实例对应 hook 卸载时释放。

不要把 Store 当作全局 singleton。共享 Store 时先确定所有者，并由所有者在结束时调用
`dispose()`。如果需要 Rust 同时拥有局部渲染树，请使用 [Component](./component.md)；
Store 与 Component 可以组合，但不会隐式共享生命周期。

## ABI v1 边界

快照字段、action 参数和返回值使用共享的 ABI v1 映射，值必须是 owned 且符合声明的
schema。异步 action、borrowed value、任意 generic 和 zero-copy typed array 尚未属于
当前边界。详见 [Rust 编写指南](../guide/rust-file-authoring.md) 与
[API 参考](../reference/api.md)。
