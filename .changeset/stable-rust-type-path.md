---
"@vooya/provider-rust": patch
"@vooya/core": patch
---

Allow named ABI types to declare a stable `crate::...` identity with
`#[voo(type_path = "...")]`. Generated declarations resolve that identity before
source-group inference, so inline modules and non-conventional source layouts
can use distinct same-named public types without being merged.
