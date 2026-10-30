---
"@vooya/core": minor
"@vooya/provider-rust": minor
---

Preserve synchronous Store action return values through Rust exports and generated TypeScript bindings. Owned scalar, container and named results use output conversion metadata; standard `Result<T, JsValue>` signatures return the successful value and propagate errors. Unit actions continue to return undefined. State commits, change notifications and disposal keep their existing behavior.

Update core and provider together and rebuild. Unsupported borrowed/recursive results produce authored-source diagnostics. React/Solid hook result declarations include undefined before readiness; direct factories and ready hooks retain the concrete result type. Async/generic actions and aliases of the entire fallible Result signature remain outside this contract.
