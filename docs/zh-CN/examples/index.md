# 示例

仓库中的示例是可运行的 evidence fixture，不是业务组件库。

- [Scatter plot（英文）](../../guide/scatter-plot.md)：Vue host + Rust-owned Canvas。
- [DataGrid benchmark（英文）](../../benchmarks/data-grid.md)：固定 workload 的测量规则。
- [Trace waterfall（英文）](../../benchmarks/trace-waterfall.md)：后续性能研究候选。

Counter、TaskList、DataGrid 和 store 也主要用于集成验证，不代表已经发布了
可直接消费的业务组件产品。不要从单个 benchmark 推导 WASM 普遍更快。
