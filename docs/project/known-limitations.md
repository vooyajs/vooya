# Known Limitations

This page is the short, user-facing map of Vooya's current boundary. It does
not replace the [project status](./status.md),
[compatibility matrix](./compatibility.md), package release records, or named
test commands. Check those canonical sources before making a production or
release decision.

## Status Legend

| Status | Meaning |
| --- | --- |
| **Supported** | A named public path has automated evidence for the stated versions and scope. |
| **Experimental** | The path is implemented and useful, but has an intentionally narrower or incomplete evidence boundary. |
| **Current-source** | Evidence requires packages built from this checkout; it is not a published registry promise. |
| **Not supported** | The project has no compatibility claim for this path. |
| **Research** | A proposal or experiment exists, but it is not product support. |

## Distribution And Toolchains

| Boundary | Status | What this means |
| --- | --- | --- |
| Rust source authoring | **Supported** | Applications compile `.rs` Components and Stores with Cargo, `wasm32-unknown-unknown` and the matching `wasm-bindgen` CLI. See [tooling](../reference/tooling.md). |
| Managed Rust tools | **Experimental** | The optional preset has named alpha evidence; native SDK/linker requirements still apply. See [next release](./next-release.md). |
| Precompiled component package builder | **Not supported** | The dedicated builder is retired. Component authors own package layout, assets and publication. See the [retirement record](../rfcs/0006-precompiled-vue-artifacts.md). |
| Current-source artifact groups | **Current-source** | Opt-in isolated Rust/WASM artifacts have Vite-only source evidence; they are not in the published registry graph. See [status](./status.md). |

## Frameworks And Bundlers

| Boundary | Status | What this means |
| --- | --- | --- |
| Vue 3 and React 19 through Vite | **Supported** | These are the primary named Rust-file Component and Store paths. See the [framework matrix](./compatibility.md#beta-framework-capabilities). |
| Solid 1.9 and Svelte 5 through Vite | **Experimental** | Named Vite/Chromium fixtures exist, but clean packed/registry-consumer evidence is narrower. |
| Rspack/Rsbuild and Webpack 5 | **Supported** | Vue/React Rust-file paths have named alpha source-tarball acceptance. Exact version, browser and framework limits remain in the [bundler matrix](./compatibility.md#supported-rust-file-bundlers). |
| Vite+, Vue Vapor and Octane | **Experimental** | Each has a named, narrower fixture. Octane remains private and outside the public release graph. |
| Rollup, Turbopack, Webpack 4 and unlisted bundlers | **Not supported** | Turbopack has a documented loader-boundary reproduction, not a source-authoring integration. |

## Browser And Host Scope

| Boundary | Status | What this means |
| --- | --- | --- |
| Named Chromium fixtures | **Supported** | Browser claims apply only to the named framework, bundler and fixture combinations. |
| Firefox | **Experimental** | Evidence is limited to the named Vue source path. |
| Safari, mobile browsers and WebViews | **Not supported** | No general compatibility claim exists. |
| Electron and Tauri | **Research** | They are host environments requiring named product evidence, not alternate Vooya runtimes. |

## Rendering And Lifecycle

| Boundary | Status | What this means |
| --- | --- | --- |
| Client-mounted Rust islands | **Supported** | The host owns routing and application shell; Rust owns its declared subtree and Store lifecycle. |
| SSR-safe host containers | **Experimental** | The named Nuxt path renders host containers on the server and mounts Rust only in the browser. See the [SSR boundary](./ssr-roadmap.md). |
| Server-rendered Rust DOM, hydration, slots and portals | **Not supported** | These are not implied by client-island or adapter tests. |
| State-preserving Rust HMR | **Not supported** | Successful Rust source edits use full reload and lose component state. |
| Errors and disposal | **Supported** | Load, mount, update and dispose errors follow the documented lifecycle boundary; see the [beta boundary](./beta-boundary.md#lifecycle-contract-still-being-frozen). |

## ABI And Data

| Boundary | Status | What this means |
| --- | --- | --- |
| Owned ABI v1 values | **Supported** | Finite numbers, bigint, nullability, vectors, tuples and string-key maps have a named mapping. |
| Recursive schemas, borrowed values, arbitrary generics, non-string maps and TypedArrays | **Not supported** | Do not infer transport support from Rust or TypeScript type syntax. See [status](./status.md#current-limits). |
| Typed synchronous Store results and isolated artifacts | **Current-source** | These require matching source-built packages and have narrower Vite evidence. See [current-source evidence](./compatibility.md#unreleased-current-source-evidence). |

## Research And Security

| Boundary | Status | What this means |
| --- | --- | --- |
| Additional providers, Go/Zig, WIT and Component Model mapping | **Research** | Rust remains the only first-party source language. See [language-provider research](./language-provider-research.md). |
| Browser IDE, remote compilation and offline language environments | **Research** | No browser Rust compiler or remote build service is currently provided. See [Issue #181](https://github.com/vooyajs/vooya/issues/181). |
| Untrusted code sandbox, implicit filesystem/network/native permissions | **Not supported** | Browser WASM and Workers do not establish an untrusted-code security model. |

## Keeping This Accurate

Support statements must link to named evidence and distinguish published,
current-source, experimental and research boundaries. Issue
[#230](https://github.com/vooyajs/vooya/issues/230) tracks a machine-checked
claim-evidence index. Update this page when a compatibility claim changes, but
keep version-specific package details in [status](./status.md) and release
records.
