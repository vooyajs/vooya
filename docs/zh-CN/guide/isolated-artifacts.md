# 独立 Rust 产物与按需加载

这是尚未发布的源码能力。默认仍将应用的 Rust 源码编译为一个 WASM；配置
`rust.artifacts` 后，每个命名分组拥有独立 Cargo crate、target 缓存、WASM 与绑定。
构建调度由共享 Rust provider 实现，Vite 负责消费；其他 bundler 暂时明确拒绝此选项。

```js
import { vooya } from "@vooya/vite";

export default {
  plugins: [vooya({ rust: { artifacts: {
    light: { sourceRoot: "src/light" },
    simulation: {
      sourceRoot: "src/simulation",
      dependencies: {
        bevy_ecs: { version: "=0.18.1", defaultFeatures: false, features: ["std"] },
      },
    },
  } } })],
};
```

每组必须明确指定应用内部、互不重叠的 `sourceRoot`，`entry`、`files`、`public` 也写在
对应组内，entry/files 不得越出该组目录。名称以小写字母开头，只包含小写字母、数字和
连字符。组之间通过 Cargo dependency 共享代码，不自动按组件拆分依赖。

与 `artifacts` 同级的 dependencies 是各组共享默认值；各组仍从自己的源码目录寻找最近
Cargo.toml。因此，重依赖应放在本组配置或本组 Cargo manifest；从公共父 manifest 继承
的重依赖不会被自动移除。

将重功能保留在宿主路由的动态导入中：

```ts
async function openSimulation() {
  const { createSimulationStore } = await import("./simulation/Simulation.rs");
  const store = await createSimulationStore();
  const unsubscribe = store.subscribe(() => render(store.getSnapshot()));
  return () => {
    unsubscribe();
    store.dispose();
  };
}
```

`render` 是应用自己的渲染回调。静态导入仍会加载对应产物；动态导入隔离浏览器加载，
生产构建仍编译所有配置的组。每个 `.rs` 入口只引用所属 WASM。类型声明继续写入
`.vooya/types`，但每个产物的 Rust 类型身份分别解析，同名类型和 Store 不会串组。

浏览器缓存已初始化的 WASM 模块。重新进入路由可以复用模块，但每次 factory 调用都会
创建新 Store；离开时销毁旧实例及其订阅。销毁 Store 不代表卸载浏览器缓存的 WASM。
公共 Rust 依赖和 runtime 代码可能在不同产物中重复，应按能力分组而非每个组件一组。

默认生成目录为 `.vooya/artifacts/<name>/`；配置 `workspace.root` 时，目录为
`<workspace.root>/artifacts/<name>/`。修改组内 Rust 仅重建所属组；修改共同依赖或
继承 manifest 可能影响多组。编译失败保留上次成功 WASM，并在后续修改时重试，诊断映射
到作者源码。开发更新仍整页刷新，不保留 Rust 状态；配置变更沿用 Vite 重启流程。

生产输出 `vooya-artifacts.json`，记录每个 WASM 的原始字节数、输出文件、所属 chunk，
以及静态/动态导入关系。结合浏览器网络记录检查体积退化，不将字节数当成性能结论。
`npm run test:rust-artifacts` 在 Vite 7/8 上从干净 tarball 安装，验证轻 Store 和 Bevy ECS Store 的类型、
加载/初始化、销毁重建、独立开发重建与失败恢复。这不定义新的预编译组件包格式。
