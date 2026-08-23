# 项目

Vooya 是一个公开 alpha 项目，正在验证“传统 Web 应用与 WASM 之间的集成层”边界。本节区分已发布证据和未来计划，避免把通过的 fixture 误解成广泛支持承诺。

## 项目页面

- [状态](./status.md)：当前 alpha 已经能做什么，以及仍有哪些限制。
- [兼容性矩阵](./compatibility.md)：框架、bundler、浏览器和工具链证据。
- [路线图与 RFC（英文原文）](../../rfcs/0008-layer-boundary-and-roadmap.md)：从集成基础设施走向稳定 layer 契约的版本方向。
- [发布说明（英文原文）](../../maintainers/releases.md)：协调各包发布的规则。
- [基准测试（英文原文）](../../benchmarks/data-grid.md)：特定 workload 的测量与限制。

## 如何理解支持声明

“Verified”表示仓库中针对命名 fixture 的自动化命令通过；“Experimental”表示路径可用于研究，但矩阵或契约仍不完整；“Not supported”表示项目目前没有对该路径做兼容性承诺。Vue/React 的版本行是当前 first-party adapter 证据，不是 Vooya 的架构上限。
