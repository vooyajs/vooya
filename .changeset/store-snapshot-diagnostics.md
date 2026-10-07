---
"@vooya/core": patch
"@vooya/provider-rust": patch
---

Report unsupported fields and recursive references in resolved Store snapshot schemas instead of silently degrading their declarations. Diagnostics identify the field path and use additive Rust source positions when available; failed builds preserve the previous successful artifacts. Existing schema-v1 producers remain readable without source positions. Missing schema metadata remains explicitly unknown, including hand-written ToJs values that the current protocol cannot distinguish from missing metadata.
