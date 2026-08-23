# 为什么是 Vooya？

一个传统 Web 应用（通常使用 Vue、React 或其他 JavaScript/TypeScript 技术栈），
可能只有一个局部能力更适合用 Rust 实现：解析器、编辑器核心、Canvas/WebGL
表面、数据密集型控件，或依赖现成 Rust crate 的状态逻辑。团队希望接入这项能力，
却不想重写页面树、路由、业务状态、设计系统和周围 DOM。

如果没有共同的集成层，每个项目都要重复处理 WASM 加载、framework adapter、
值转换、生命周期所有权、事件、声明文件、错误报告和 bundler 产物。Vooya
就是为标准化这段重复工作而创建的。

## 保留 JavaScript，只移动昂贵的部分

Vooya 这个名字来自“驶向岛屿”的想法：JavaScript 继续作为熟悉的应用表面，
只有一个聚焦的高成本能力被交给更适合它的运行时。它强调渐进式接入，而不是
要求团队把产品重写成 Rust。Vooya 组织里的其他项目也遵循类似的边界思路：例如
Rush-FS 保留 Node 风格的 JavaScript API，同时把文件系统工作交给原生 Rust；
Vooya 则把这种“先保留宿主边界”的方法带到浏览器 WASM 能力岛。

Vooya 由一组围绕这条边界的工具和实验组成。仓库里的 compiler、adapter、示例和
验证 fixture 服务于集成工作；它不是宿主应用的 framework、router 或 design system
替代品。

## Vooya 标准化什么

Vooya 把宿主应用连接到一个边界明确的 Rust/WASM capability island。宿主继续
拥有应用外壳；Vooya 负责 source build、ABI、typed props/events、store、
lifecycle、disposal、diagnostics 和 bundler output。因此它是 **WASM 集成层**，
不是另一个 UI framework。

当前 alpha 采用 host-first 模式：现有 Web 应用的 renderer 拥有 host element
和应用，Rust 只拥有它下面的局部 DOM 与资源。Vue 和 React 是当前 first-party
adapter 与测试证据，不是架构上限。

## 选择 Vooya 能得到什么

和一次性的 `wasm-bindgen` / `wasm-pack` 接入相比，Vooya 提供的是一套可以
重复使用的契约，而不是每个项目都重新维护一份 wrapper：

- Rust component 和 store 使用统一的 authoring model；
- 自动生成 props、events、lifecycle、dispose、declarations 和 diagnostics；
- 通过稳定的 host adapter 边界复用集成方式，不必为每个组件重写 framework glue；
- bundler plugin、校验、开发重建和兼容性 fixture 可以沿着同一套约定演进。

Vooya 并不替代 `wasm-bindgen` 或 `wasm-pack`，而是把这些底层工具刻意留给各个
项目的应用集成工作标准化。换句话说，它也是自定义 WASM wrapper 的可复用生产
方案，而不是只为某个库再写一层 wrapper。

## 它和相邻方案有什么区别？

| 方案 | 应用由谁拥有 | Rust toolchain 责任 | 解决的问题 | 与 Vooya 的关系/边界 |
| --- | --- | --- | --- | --- |
| 手写 `wasm-bindgen` / `wasm-pack` | 团队自行决定边界 | 团队自己接 Cargo、WASM、bindings 和 assets | 编译和基础 JavaScript binding | Vooya 建立在这些基础上，进一步约定 adapter、ABI、lifecycle、events、declarations 和 bundler glue |
| Yew、Dioxus、Leptos 等 Rust 主导 UI framework | Rust 通常拥有应用 renderer 或渲染树 | Rust 是主要应用 toolchain | 用 Rust-first 方式构建 UI | Rust-led UI 与 Vooya 的 host-first Web integration 目标不同 |
| Web Components | 浏览器 element 是跨框架边界 | Web Components 本身不解决 Rust/WASM 构建 | 封装和跨框架消费 | 未来可能作为消费边界之一；当前 Vooya 不宣称已有 Web Component adapter |
| 自定义 WASM wrapper | 每个团队拥有自己的 contract 和 glue | 每个团队自己拼装 toolchain | 任意定制集成 | Vooya 把重复的 build、ABI、lifecycle 和 bundler 约定变成可复用路径 |
| Rust core + 多框架包装 | 通常由单个产品决定应用边界 | 产品团队维护 Rust build 和多个 wrapper | 一个 Rust core 服务多个 framework package | dotLottie 等公开先例说明需求真实存在；Vooya 候选价值是把流程通用化 |

这张表比较的是设计目标，不是给方案排名；不同 ownership model 下，合理选择
也会不同。

## 什么时候适合 Vooya？

- 想在传统 Web 应用中加入 Rust/WASM 能力，又不想每个团队分别维护加载、ABI、
  生命周期和 bundler glue 的项目。
- 编辑器、解析器、timeline、Canvas/WebGL、数据密集型局部控件，或其他能用清晰
  typed contract 描述的 capability。
- 想复用 browser-compatible Rust crate，同时保留现有 renderer、路由、状态和设计系统
  的项目。

## 当前范围与未来层

当前 alpha 聚焦于传统 Web host 中的 client-side、边界清晰的能力岛。普通布局、
路由、表单、设计系统组件和全局业务状态在集成过程中继续由宿主负责。

SSR、hydration 和 standalone Rust renderer 尚未进入当前 alpha 路径，但它们是路线图
中可能继续建设的未来层，而不是永久不做的 non-goal。Vooya 也不等于“WASM 一定更快”；
具体 workload 仍应和真实宿主基线测量。

## 常见问题

### 如何在 Vue/React 项目中使用 Rust/WASM？

Vue 和 React 是当前公开的 first-party adapter。保留现有 Web 宿主应用，按[快速开始](guide/getting-started.md)配置 adapter，再接入 Rust 组件岛即可。

### wasm-bindgen 和 Vooya 有什么区别？

`wasm-bindgen` 解决基础绑定；Vooya 进一步约定宿主集成、ABI、生命周期、事件、声明和 bundler glue。

### Vooya 是 framework 还是 integration layer？

是 WASM integration layer，不替换宿主 framework，也不要求整个应用由 Rust 渲染。

### 能否接入其他 Web 框架？

可以，这是架构目标：Vooya 是传统 Web host 与 WASM 能力岛之间的
framework-agnostic integration layer。当前公开并有独立证据的 first-party
adapter 集中在 Vue 和 React；其他框架需要单独的 adapter、契约和兼容性验证，
不能从架构目标推断为已经支持。

## 下一步

先看[组件边界](concepts/component-boundary.md)，再跑[快速开始](guide/getting-started.md)，
然后查[工具参考](reference/tooling.md)和[兼容性矩阵](project/compatibility.md)。
当前 Vite 是主路径，Rspack/Webpack 仍是 experimental，预编译 artifacts 还
不是已经发布的消费者产品。
