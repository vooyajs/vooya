---
"@vooya/build-core": patch
---

Serialize builds sharing one generated workspace without letting stale-lock
recovery remove a new owner's lock. Keep the previous JavaScript, WASM, and
workspace metadata intact when binding generation, schema validation, CSS or
TypeScript generation, artifact reads, or final installation fails.
