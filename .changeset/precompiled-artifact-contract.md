---
"@vooya/vite": patch
---

Make precompiled Vue artifacts declare independent product and `@vooya/vue`
adapter versions, validate adapter ranges, loader/WASM/stylesheet assets and
shipped binding exports, and consume the packed product with a transitive
adapter in the clean consumer fixture.
Use npm's normal prerelease range matching so the recorded adapter compatibility
also holds when consumers install the product.
