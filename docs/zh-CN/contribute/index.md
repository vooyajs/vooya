# 参与贡献

Vooya 处于公开 alpha 阶段，欢迎围绕真实证据参与：一个能复现的问题、一个小而完整的 fixture、一处文档修订，或一份能说明当前方向需要调整的 RFC 讨论，都很有价值。

## 从一个小任务开始

1. 先读[项目状态](../project/status.md)和[兼容性矩阵](../project/compatibility.md)。
2. 搜索已有 issue 和 pull request，避免重复工作。
3. 提交一个边界清晰的 reproduction、fixture、文档修订或实现改动。
4. 在说明中区分已观察行为、验证证据和未来设想。

好的兼容性报告应包含 Vooya、Node、Rust、`wasm-bindgen`、宿主框架、bundler、浏览器和操作系统的精确版本，以及可从干净目录运行的最小复现。请删除 token、私人路径和无关日志。

## 长期参与

你可以从一次完整的小修复开始，也可以随着熟悉项目逐步长期参与。持续贡献者在项目需要和维护者判断的基础上，可能获得公开署名、发布说明与 changelog 归因、文档或示例 credits、设计讨论邀请，以及 reviewer 或 maintainer 的参与路径。这些不是预先承诺，会根据持续贡献、项目需要和维护质量逐步决定。

Vooya 是志愿开源协作，不等同于雇佣关系。项目不承诺薪酬、股权、职位或固定投入；任何资助、 bounty 或商业合作，只有在单独的公开说明发布后才成立。

## 设计与 RFC

涉及用户可见契约或架构决策时，先提交 `RFC: <proposal>` issue，说明问题、替代方案和验收标准。普通 bug、兼容性证据和文档改动直接提交 issue 或 pull request 即可。`.voo` 是已退休的探索格式，不是新的功能目标。

更多命令、许可和 pull request 检查见仓库的[贡献指南（英文原文）](https://github.com/vooyajs/vooya/blob/main/CONTRIBUTING.md)。
