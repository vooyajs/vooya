---
"@vooya/core": patch
"@vooya/build-core": patch
---

Generate concrete TypeScript interfaces for derived Rust structs and unit enums
used in component props, events, and Store snapshots. Preserve each framework's
native Store state container. Missing schemas remain `unknown`; a known struct
with unrepresentable fields falls back to `Record<string, unknown>` rather than
promising an unverified shape. Includes the implementation merged in PR #122.
