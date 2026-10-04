# 参考

参考页集中放可复制的配置、生成目录和精确的兼容性边界。想先跑起来请回到
[指南](../guide/index.md)；想了解产品边界请看[项目状态](../project/status.md)。

- [工具配置](./tooling.md)：`vooya()`、Rust 依赖、toolchain、`.vooya/` 和
  Rspack/Webpack adapter。
- [API 参考](./api.md)：公开导出、参数和当前 beta 边界。
- [兼容性矩阵](../project/compatibility.md)：每一项支持声明对应的命令和版本。
- [英文 RFC 0007](../../rfcs/0007-rust-file-authoring-and-abi-v1.md)：schema、
  declarations、store 和 ABI v1 的设计记录。

从 npm `beta` 渠道安装并保留 lockfile。首个 Beta 的十个包均为 `0.1.0-beta.0`；
后续按包独立发版，内部依赖保持精确版本，prerelease ABI 仍可能有破坏性变更。
