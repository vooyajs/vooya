# 为什么是 Vooya？

一个已有的 Vue 或 React 应用，可能只有一个局部能力更适合用 Rust 实现：
解析器、编辑器核心、Canvas/WebGL 表面、数据密集型控件，或依赖现成 Rust
crate 的状态逻辑。团队希望接入这项能力，却不想重写页面树、路由、业务状态、
设计系统和周围 DOM。

如果没有共同的集成层，每个项目都要重复处理 WASM 加载、framework adapter、
值转换、生命周期所有权、事件、声明文件、错误报告和 bundler 产物。Vooya
就是为标准化这段重复工作而创建的。

## Vooya 标准化什么

Vooya 把宿主应用连接到一个边界明确的 Rust/WASM capability island。宿主继续
拥有应用外壳；Vooya 负责 source build、ABI、typed props/events、store、
lifecycle、disposal、diagnostics 和 bundler output。因此它是 **WASM 集成层**，
不是另一个 UI framework。

当前 alpha 采用 host-first 模式：Vue 或 React 拥有 host element 和应用，Rust
只拥有它下面的局部 DOM 与资源。

## 它和相邻方案有什么区别？

| 方案 | 应用由谁拥有 | Rust toolchain 责任 | 解决的问题 | 与 Vooya 的关系/边界 |
| --- | --- | --- | --- | --- |
| 手写 `wasm-bindgen` / `wasm-pack` | 团队自行决定边界 | 团队自己接 Cargo、WASM、bindings 和 assets | 编译和基础 JavaScript binding | Vooya 建立在这些基础上，进一步约定 adapter、ABI、lifecycle、events、declarations 和 bundler glue |
| Yew、Dioxus、Leptos 等 Rust 主导 UI framework | Rust 通常拥有应用 renderer 或渲染树 | Rust 是主要应用 toolchain | 用 Rust-first 方式构建 UI | 适合 Rust 主导应用；Vooya 适合已有 Vue/React 应用里的渐进式 island 接入 |
| Web Components | 浏览器 element 是跨框架边界 | Web Components 本身不解决 Rust/WASM 构建 | 封装和跨框架消费 | 未来可能作为消费边界之一；当前 Vooya 不宣称已有 Web Component adapter |
| 自定义 WASM wrapper | 每个团队拥有自己的 contract 和 glue | 每个团队自己拼装 toolchain | 任意定制集成 | Vooya 把重复的 build、ABI、lifecycle 和 bundler 约定变成可复用路径 |
| Rust core + 多框架包装 | 通常由单个产品决定应用边界 | 产品团队维护 Rust build 和多个 wrapper | 一个 Rust core 服务多个 framework package | dotLottie 等公开先例说明需求真实存在；Vooya 候选价值是把流程通用化 |

这张表比较的是设计目标，不是给方案排名；不同 ownership model 下，合理选择
也会不同。

## 什么时候适合 Vooya？

- 编辑器、解析器、timeline、Canvas/WebGL 或数据密集型局部控件。
- 能用较小 typed props/events/store contract 描述的 capability。
- 想复用 browser-compatible Rust crate，但不想把整个应用交给 Rust renderer。

## 什么时候不适合？

普通布局、路由、表单、设计系统组件和全局业务状态继续留在宿主 framework。
Vooya 也不是通用 SSR/hydration 方案、standalone Rust renderer，更不是为了
宣传“WASM 一定更快”而迁移代码。

## 下一步

先看[组件边界](concepts/component-boundary.md)，再跑[快速开始](guide/getting-started.md)，
然后查[工具参考](reference/tooling.md)和[兼容性矩阵](project/compatibility.md)。
当前 Vite 是主路径，Rspack/Webpack 仍是 experimental，预编译 artifacts 还
不是已经发布的消费者产品。
