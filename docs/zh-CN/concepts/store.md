# Store

Vooya store 是一个无 DOM 的 Rust/WASM 状态能力。它拥有 instance-scoped state
machine，并提供 snapshot、subscription、声明的 action 和 dispose；它不拥有
DOM subtree。

## Contract

| 部分 | 方向 | 作用 |
| --- | --- | --- |
| Snapshot | Rust → Host | 读取当前可序列化状态 |
| Subscription | Rust → Host | snapshot 变化时通知 adapter |
| Action | Host → Rust | 执行声明的同步状态转换 |
| Dispose | Host → Rust | 释放 listener 和其他资源 |

使用 `#[voo::store]` 声明 store，使用 `#[voo::action]` 标记公开状态转换，使用
`#[voo::snapshot]` 暴露状态。当前 ABI 从 Rust 的 `Default` 创建 instance；构造
参数和异步 action 不属于 ABI v1。

## 所有权

Store 默认是 instance-scoped。一个 component 或 host service 可以拥有一个 store；
多个消费者也可以共享，但必须由独立 owner 负责生命周期。Vue 的
`disposeOnUnmount` 因此是显式选项；React 生成的 hook 会在自己创建的 instance
对应 hook unmount 时 dispose。

不要把 store 当作全局 singleton。共享 store 时先确定 owner，并由它在结束时调用
`dispose`。

## 宿主消费

Vue 中使用 `useVooyaStore` 镜像最新 snapshot，并显式 dispatch action：

```ts
const { snapshot, dispatch } = useVooyaStore(createCartStore(), {
  disposeOnUnmount: true,
});

dispatch("add", 1);
```

React 中生成的 hook 遵循 `useSyncExternalStore`，因此沿用同一份
snapshot/subscription contract，而不是再发明一套状态模型：

```tsx
const { state, add } = useCart();
add(1);
```

Snapshot、action 参数和返回值使用共享的 ABI v1 映射。值需要是 owned 且符合 schema；
异步 action、borrowed value、任意 generic 和 zero-copy typed array 不在当前边界。

需要无 DOM 的可复用状态或计算时选择 Store；需要 Rust 拥有局部渲染树时选择
[Component](./component.md)。两者可以组合，但不会隐式共享生命周期。

参见 [Rust 编写指南](../guide/rust-file-authoring.md)和 [API 参考](../reference/api.md)。
