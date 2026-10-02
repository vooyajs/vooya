---
"@vooya/vite": patch
---

Keep an already verified WASM target marked as installed when toolchain
resolution fails because wasm-bindgen is missing or has the wrong version.
The doctor report still fails overall and identifies the CLI problem without
incorrectly asking authors to install the Rust target again.
