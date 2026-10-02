---
"@vooya/vue": patch
"@vooya/react": patch
"@vooya/solid": patch
"@vooya/svelte": patch
---

Accept generated Rust Store interfaces in the public low-level store adapters without requiring arbitrary string keys. Preserve inferred snapshot types and declared action signatures, including Promise-returning factories; existing explicit generic calls remain supported.
