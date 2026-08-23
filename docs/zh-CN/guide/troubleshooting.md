# 排错

先在应用根目录运行：

```sh
npm exec -- vooya doctor
```

## Rust 或 WASM target 错误

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.115 --locked
```

如果机器上有多个 Rust 安装，用 `vooya doctor --cargo-path <path>` 和
`toolchain.cargoPath` 指定同一个 Cargo。Vooya 以该 Cargo 实际选择的 rustc
为准，不会静默拼接另一套 toolchain。

## Windows linker 错误

MSVC host 需要 Visual Studio Build Tools 的 **Desktop development with C++**
和 Windows SDK。重新打开终端，确保 `link.exe` 能被 Cargo 找到。

## TypeScript 找不到声明

声明在 `.vooya/types`，不会写回 `.rs` 旁边。配置 `allowArbitraryExtensions`
和 `rootDirs: [".", ".vooya/types"]`；Vooya 不会自动改你的 tsconfig。可以
执行 `vooya clean` 清理旧 workspace，再重新 build。

## 失败后开发服务器坏掉

修复报错指向的 Rust 行并再次保存。Vite、Rspack、Webpack 路径都会尝试从失败
构建恢复；成功的 Rust rebuild 当前会触发整页 reload，不保留组件 state。

仍无法复现时，请提供 package、Node、Rust、wasm-bindgen、framework、bundler、
操作系统、命令和干净 consumer reproduction。不要提交 token、私人路径或无关日志。
更多边界问题见[FAQ](../faq.md)。
