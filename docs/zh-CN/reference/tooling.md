# 工具参考

## `vooya()` 参数

```ts
vooya({
  framework: "vue",
  rust: {
    dependencies: {
      serde: { version: "1", features: ["derive"] },
      "shared-engine": { path: "rust/shared-engine" },
    },
    webSysFeatures: ["HtmlCanvasElement"],
  },
  toolchain: { cargoPath: "/opt/custom-rust/bin/cargo" },
});
```

| 参数 | 类型/取值 | 默认值 | 作用 | 限制与证据 |
| --- | --- | --- | --- | --- |
| `framework` | `"vue" \| "react"` | `"vue"` | 选择宿主 adapter | Vue 3 与 React 19 fixture；不改变 Rust ABI |
| `rust.dependencies` | `Record<string, string \| Dependency>` | `{}` | 添加 Cargo registry/Git/path 依赖 | core browser 依赖由生成 crate 管理 |
| `rust.webSysFeatures` | `string[]` | `[]` | 开启 `web-sys` browser API | 不要覆盖生成的 `web-sys` |
| `toolchain.cargoPath` | `string` | PATH discovery | 指定构建使用的 Cargo | 该 Cargo 的 rustc、target、CLI 必须一致，不会静默 fallback |
| `workspace.root` | `string` | `.vooya/` | 移动生成 workspace | `rootDirs` 与 clean 命令也要同步 |

`Dependency` 支持 `version`、`path`、`git`、`branch`、`tag`、`rev`、`package`、
`features` 和 `defaultFeatures`；相对路径从应用根目录解析。

## `.vooya/` workspace

```text
.vooya/
├── build/        # 生成 Cargo workspace 和提取后的 Rust
├── wasm/         # wasm-bindgen JavaScript/WASM 输出
├── types/        # *.d.rs.ts 声明
├── cache/        # bundler 生成模块和 fingerprints
└── metadata.json # schema、ABI 和 toolchain fingerprint
```

这些都是生成状态，默认被 Git 忽略。使用 `npx vooya clean` 清理。TypeScript
项目通常配置 `allowArbitraryExtensions: true` 和
`rootDirs: [".", ".vooya/types"]`；Vooya 不会修改 tsconfig。

## `vooya doctor` 与 toolchain 模式

| 模式 | Cargo 选择 | 适合场景 | 保证 |
| --- | --- | --- | --- |
| Discovered | PATH 中第一个 coherent Cargo | 普通 rustup 安装 | 使用该 Cargo 实际选择的 rustc |
| Explicit | `toolchain.cargoPath` / `--cargo-path` | 多套 Rust 或 Tauri toolchain | 不完整时失败，不自动换另一套 |

项目可以自行管理 native 与 WASM 的 Cargo policy，但这不是 Vooya 当前保证
的第三种 toolchain 模式；managed toolchain 和不需要本地 Rust 的 precompiled
consumer 仍属于未来方向。

```sh
npx vooya doctor
npx vooya doctor --cargo-path /opt/custom-rust/bin/cargo
```

## Experimental adapter

`@vooya/rspack` 提供 `vooyaRsbuild()` 与 `vooyaRspack()`；证据下限是 Rspack
`2.1.10`、Rsbuild `2.1.13`。`@vooya/webpack` 的实验范围为 Webpack `>=5`，
fixture 覆盖 5.101.0 和 5.109.2。两者尚未证明与 Vite Rust-file 路径 parity，
SSR、hydration、Module Federation 和 state-preserving HMR 不在当前承诺内。

完整英文参数说明见[Tooling Reference](../../reference/tooling.md)。
