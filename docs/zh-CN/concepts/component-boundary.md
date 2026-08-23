# 组件边界

传统 Web renderer 继续拥有页面树、路由、周围状态和挂载用的 host element。
Vue、React 是当前 first-party adapter；这个边界并不限定其他 host。挂载后：

```text
传统 Web 宿主应用
  -> framework-owned host element
     -> Vooya-owned DOM subtree
        -> Rust state、listeners 和 rendering
```

| 操作 | 宿主侧 | Rust/WASM 侧 | 所有权 |
| --- | --- | --- | --- |
| mount | 创建并提供 host | 创建 island root 和状态 | 宿主拥有 element，Rust 拥有 descendants |
| update | 发送声明的 props | 应用 atomic patch | 通过 owned ABI v1 传输 |
| event | 接收 adapter callback | 发出不冒泡 `vooya-*` event | 事件停留在 component host |
| dispose | framework unmount | 移除 DOM、释放资源 | 每个 listener/resource 都要有 owner |

实际生命周期是 `mount → update* → dispose`；任何阶段的错误都会由 framework
adapter 报告。事件不是全局 DOM bus，也不会冒泡到外层或其他 island。

## 适合与不适合

数据表格、编辑器、timeline、可视化控件、Canvas/WebGL 和已有 Rust crate
驱动的能力值得考虑。普通 DOM、路由、表单、SSR、hydration、slots 和全局
state 管理仍由宿主应用负责。

这是一种 ownership 和 build complexity 都有明确收益时才使用的边界，不是
性能宣传：具体 workload 仍需和宿主基线测量。
