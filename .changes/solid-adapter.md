---
vooya-compiler: "patch:feat"
vooya-core: "patch:feat"
vooya-build-core: "patch:feat"
vooya-vite: "patch:feat"
vooya-vue: "patch:feat"
vooya-react: "patch:feat"
vooya-solid: "patch:feat"
vooya-svelte: "patch:feat"
vooya-rspack: "patch:feat"
vooya-webpack: "patch:feat"
---

Add Solid and Svelte adapters for Rust-file components and instance-scoped stores, and
move generated framework integration behind a shared bridge definition that
each host adapter wraps with its native reactive and lifecycle primitives.
Rust dependency defaults now follow explicit plugin options, then the nearest
Cargo manifest, then Vooya defaults. Routine CI no longer installs a browser or
runs E2E matrices; those remain in the local release gate.
