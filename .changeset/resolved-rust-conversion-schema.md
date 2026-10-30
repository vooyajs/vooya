---
"@vooya/core": minor
"@vooya/provider-rust": minor
---

Resolve ABI value types through Rust conversion traits and emit schema v2, preserving identities across aliases, inline modules and path overrides. Generate deterministic, reachable TypeScript types with separate input/output shapes when conversions differ. Manual conversions remain opaque (`unknown`); missing explicit metadata now fails instead of selecting a same-name type. Runtime prop categories also follow resolved aliases.

Update core and the Rust provider together and rebuild artifacts. The provider still accepts legacy schema v1; runtime ABI v1 is unchanged. `ToJs` gains a default metadata associated constant and is no longer dyn-compatible. Existing concrete manual implementations need no additional member; replace `dyn ToJs` with a generic boundary or an application-owned object-safe conversion interface.
