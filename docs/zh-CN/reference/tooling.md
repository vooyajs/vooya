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
| `framework` | `"vue" \| "react" \| "solid" \| "svelte"` | `"vue"` | 选择宿主 adapter | Vue 3、React 19 为 supported；Solid 1.9、Svelte 5 有 experimental Vite 7 evidence；不改变 Rust ABI |
| `rust.dependencies` | `Record<string, string \| Dependency>` | 就近 `Cargo.toml`，再回退 `{}` | 添加或覆盖 Cargo registry/Git/path 依赖 | core browser 依赖版本由生成 crate 管理 |
| `rust.webSysFeatures` | `string[]` | 就近 `Cargo.toml`，再回退 `[]` | 开启 `web-sys` browser API | 显式数组优先于 manifest features；运行时内建 features 始终保留 |
| `toolchain.cargoPath` | `string` | PATH discovery | 指定构建使用的 Cargo | 该 Cargo 的 rustc、target、CLI 必须一致，不会静默 fallback |
| `workspace.root` | `string` | `.vooya/` | 移动生成 workspace | `rootDirs` 与 clean 命令也要同步 |

`Dependency` 支持 `version`、`path`、`git`、`branch`、`tag`、`rev`、`package`、
`features` 和 `defaultFeatures`。插件显式 path 从应用根目录解析；Cargo manifest
继承的 path 从对应 manifest（或 workspace manifest）目录解析。

Vooya 按 `rust.entry` 所在目录、`rust.sourceRoot`（默认 `src`）、应用根目录的
顺序开始查找，并向 repository boundary 寻找最近的 `Cargo.toml`。普通 package 和
workspace member 的 `[dependencies]` 都可作为默认值，`workspace = true` 会从
`[workspace.dependencies]` 解析。
同名配置的优先级是：`vooya({ rust })` 显式参数 > 就近 `Cargo.toml` > Vooya
默认值。manifest 中的 path 以 manifest 所在目录为基准，插件里的 path 仍以
应用根目录为基准。`vooya`/`vooya-core`、`wasm-bindgen`、`js-sys`、`web-sys`
的精确版本或 source 由当前 Vooya release 管理，以确保 Rust runtime 与 CLI 一致；
manifest 仍可贡献 features。当前检查只会提前拒绝冲突的 exact pin，不应描述成
完整的 semver compatibility solver。

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

## 仓库验证层级

```sh
npm run verify:ci       # 日常非 browser CI，不跑 browser E2E
npm run verify:e2e      # 单独执行 browser 与 bundler E2E
npm run verify:release  # 两者都跑，再执行 release checks
```

Svelte 的具名端到端命令是 `npm run test:rust-svelte`。当前只覆盖 Svelte 5 +
Vite 7 + Chromium，包括 Component mount/callback、Store action、prop update、生成
声明，以及卸载子组件后 Component handle 与 generated Store 各一次 cleanup；不扩展为
SvelteKit、SSR/hydration、Vite 8 或其他 bundler/browser 兼容声明。

## Experimental adapter

`@vooya/rspack` 提供 `vooyaRsbuild()` 与 `vooyaRspack()`；证据下限是 Rspack
`2.1.10`、Rsbuild `2.1.13`。`@vooya/webpack` 的实验范围为 Webpack `>=5`，
fixture 覆盖 5.101.0 和 5.109.2。两者尚未证明与 Vite Rust-file 路径 parity，
SSR、hydration、Module Federation 和 state-preserving HMR 不在当前承诺内。

完整英文参数说明见[Tooling Reference](../../reference/tooling.md)。
