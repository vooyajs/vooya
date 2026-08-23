# 兼容性

这张表记录仓库里的自动化证据，不是跨浏览器认证或生产支持承诺。

| 层 | 版本 | 状态 | 边界 |
| --- | --- | --- | --- |
| Node.js | `^20.19.0 \|\| >=22.12.0` | Supported | quickstart 覆盖 Ubuntu/Node 20、macOS/Node 22、Windows/Node 22 |
| Vue | `>=3.5.2 <4` | Supported | 3.5.2–3.5.41 声明检查通过；3.6/Vapor 仍是 experimental evidence |
| React | `>=19` | Supported | fixture 覆盖 19.0.0 与 19.2.0 |
| Vite | `>=7 <9` | 主路径 | Vite 8.2.1 是主要 packed target，Vite 7 保持回归测试 |
| Rspack / Rsbuild | Rspack `>=2.1.10`；Rsbuild `>=2.1.13` | Experimental | Vue/React/Rslib fixture；尚未证明 Rust-file Vite parity |
| Webpack | `>=5` | Experimental | 5.101.0、5.109.2 fixture；Webpack 4 不支持 |
| Vue Vapor | Vue 3.6.0-beta.17 + Vite 8.2.1 | Experimental | 需要 Vue 的 `vaporInteropPlugin`，不是 Vooya 自己的 renderer |

## 尚未支持或未验证

Safari/WebKit、移动浏览器、SSR、hydration、Rollup、Turbopack 和未列出的
bundler 没有当前兼容性声明。没有正式预编译组件产品；保留的 Vue fixture
只是 build-contract 证据。`.voo` 是已退休的探索格式，不能作为新组件输入。

查看每项命令和完整边界请看[英文兼容性矩阵](../../project/compatibility.md)。
