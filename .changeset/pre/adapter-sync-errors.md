---
"@vooya/react": patch
"@vooya/solid": patch
"@vooya/svelte": patch
---

Report synchronous component binding loader failures through the existing
`onError` lifecycle callback in React, Solid, and Svelte, matching rejected
loader promises. Report synchronous Solid and Svelte Store factory failures
through their existing `onError` callback without losing owner context.
