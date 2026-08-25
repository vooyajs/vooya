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

authoring 宏使用 `proc-macro2` 的 span location 来报告 Rust 源文件。启用
`span-locations` 后，该 API 在 stable Rust 1.88 及更高版本可用。Vooya 推荐
使用当前 stable Rust；如果较旧或被锁定的 toolchain 报告 `Span::file()` 不存在，
请先用 `cargo tree -i proc-macro2` 检查实际依赖版本，必要时更新 lockfile，并用
执行构建的同一个 Cargo 运行 `vooya doctor`。

如果机器上有多个 Rust 安装，用 `vooya doctor --cargo-path <path>` 和
`toolchain.cargoPath` 指定同一个 Cargo。Vooya 以该 Cargo 实际选择的 rustc
为准，不会静默拼接另一套 toolchain。

## 受限网络与中国地区镜像

如果 `rustup` 或 Cargo 无法访问官方地址，可以使用所在地区可访问的镜像。
中国大陆用户可以先临时为当前终端设置清华 TUNA 的 Rust 分发镜像：

```sh
export RUSTUP_DIST_SERVER=https://mirrors.tuna.tsinghua.edu.cn/rustup
export RUSTUP_UPDATE_ROOT=https://mirrors.tuna.tsinghua.edu.cn/rustup/rustup
```

对于 crates.io，可以在 `$CARGO_HOME/config.toml`（通常是
`~/.cargo/config.toml`）中配置 sparse 镜像：

```toml
[source.crates-io]
replace-with = "tuna"

[source.tuna]
registry = "sparse+https://mirrors.tuna.tsinghua.edu.cn/crates.io-index/"
```

这些配置会影响整套 Cargo，而不只影响 Vooya。使用前请查看镜像站的最新说明
并确认组织的网络策略；需要复现官方 registry 问题时，应暂时移除 override。
无论是否使用镜像，Vooya 仍然使用当前环境中 Cargo 实际选择的 rustc。

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
