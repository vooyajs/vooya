# 项目

Vooya 是一个公开 beta 项目，正在验证“传统 Web 应用与 WASM 之间的集成层”边界。本节区分已发布证据和未来计划，避免把通过的 fixture 误解成广泛支持承诺。

## 项目页面

- [下一轮发布：0.2 开发中](./next-release.md)：托管工具链和新集成的未发布配置。
- [发布线与功能批次](./release-lines.md)：已发布 0.1 维护与未发布 0.2 候选的边界。
- [状态](./status.md)：当前 beta 已经能做什么，以及仍有哪些限制。
- [兼容性矩阵](./compatibility.md)：框架、bundler、浏览器和工具链证据。
- [Lab self-hosting 计划（英文原文）](../../rfcs/0011-lab-self-hosting-program.md)：
  本仓库与 Vooya Lab 之间持续的 evidence 和 ownership loop。
- [路线图与 RFC（英文原文）](../../rfcs/0008-layer-boundary-and-roadmap.md)：从集成基础设施走向稳定 layer 契约的版本方向。
- [发布说明（英文原文）](../../maintainers/releases.md)：协调各包发布的规则。
- [基准测试（英文原文）](../../benchmarks/data-grid.md)：特定 workload 的测量与限制。

## 如何理解支持声明

“Verified”表示仓库中针对命名 fixture 的自动化命令通过；“Experimental”表示路径可用于研究，但矩阵或契约仍不完整；“Not supported”表示项目目前没有对该路径做兼容性承诺。Vue/React 的 supported 版本行与 Solid/Svelte 的 experimental 版本行都是当前 first-party adapter 证据，不是 Vooya 的架构上限。

## 项目家族

- [Vooya FS](https://github.com/vooyajs/fs)：Rush-FS 在 Vooya 边界模型下的延续，面向 Node.js 原生批量文件系统任务。
- [Vooya Lab](https://vooyajs.github.io/vooya-lab/)：Rust、WASM、ABI、内存与宿主运行时决策的可运行实验和证据。新 case 应遵循其
  [case specification](https://github.com/vooyajs/vooya-lab/blob/main/docs/case-spec.md)；影响 compiler、ABI、runtime、adapter 或 tooling 的
  发现应回流到本仓库的 focused issue 和修复，而不是作为永久 Lab workaround。

这些项目共享设计原则，但不共享兼容矩阵；Lab 是持续 evidence 与产品发现计划，
不是第二套支持矩阵或自动 beta gate。本仓库的浏览器兼容结论不能外推为 Node
文件系统兼容结论，反之亦然。

- [SSR 与 0.2 provider 计划](./ssr-roadmap.md)
