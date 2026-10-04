# Next release: 0.2 work in progress

The current npm packages are the [0.1 beta releases](./status.md). The features
below are source work proposed for the next 0.2 batch. No 0.2 alpha installation
is available from this documentation yet. A successful checkout build or packed
test does not mean that `npm install @vooya/vite@beta` includes these changes.

For a first application, use the [published quickstart](../guide/getting-started.md).
For the scope freeze, maintenance candidates and publication prerequisites,
read [Release lines](../maintainers/release-lines.md). That page governs the
release plan; this page explains the user-facing differences.

## Managed Rust toolchain

Current source can discover an optional `@vooya/preset` dependency declared in
the application or an ancestor project. It prepares pinned Rust/WASM tools in
an isolated cache. It still compiles Rust locally and requires the host linker
and SDK where applicable. The preset is not a Rust-free component runtime.

These settings are **unreleased**:

| Setting | Source behavior |
| --- | --- |
| `toolchain.mode: "auto"` (default) | Uses a declared preset when present; otherwise uses system discovery. An explicit `cargoPath` selects system tools. |
| `toolchain.mode: "system"` | Uses installed system tools without preparing a preset. |
| `toolchain.mode: "managed"` | Requires the project's preset; an explicit `cargoPath` is an error. |
| `VOOYA_TOOLCHAIN` | Selects the mode when the configured mode is `auto`. |
| `vooya doctor --toolchain auto\|system\|managed` | Diagnoses the same source-only selection policy. |

If managed preparation fails, inspect the installer error and retry after
correcting the download or host prerequisite. Vooya does not silently fall
back to system tools. Choose `system` explicitly when that is your intent.
The [preset source README](https://github.com/vooyajs/vooya/blob/main/packages/preset/README.md)
records cache and platform details. Published beta users should continue using
[system toolchain diagnostics](../reference/tooling.md#doctor).

## Host integrations

| Candidate | Source evidence and remaining boundary |
| --- | --- |
| Octane 0.9 | Native client Component and Store adapter; Node >=22.22.2; pinned Vite 8 and Vite+ fixtures. No SSR claim. |
| Vite+ 0.2.9 | Five-framework packed dev/build fixtures with the documented aliases and overrides. Normal npm peer resolution; no claim for all Vite+ tools or versions. |
| Webpack/Rspack `.rs` authoring | Vue/React components, Stores, CSS and declarations; Vue watch recovery and new-module checks. Other watch/framework combinations remain unverified. |
| SSR-safe islands | Vue lazy Store creation and React client boundaries; named Nuxt production/browser fixture. Rust content still mounts in the browser; Next.js is unverified. |

See [source compatibility evidence](./compatibility.md#current-source-browser-fixtures),
[experimental setup](../guide/other-integrations.md#vite), and the
[SSR boundary](./ssr-roadmap.md). These are candidate evaluation paths, not
instructions to combine unpublished features with npm beta packages.

## Rust provider extraction

[PR #148](https://github.com/vooyajs/vooya/pull/148) separates the Rust build
implementation into `@vooya/provider-rust`. `@vooya/build-core` remains a
compatibility entry point. The proposal preserves exported functions, type
identity and build artifacts; it does not add a public multi-language provider
registry or a new artifact protocol. Neither the new package nor this
extraction is part of the published 0.1 beta.

## Evaluating a candidate

Use a single reviewed checkout and its matching tarballs, including exact
internal dependencies. The named repository tests install these artifacts into
fresh consumers. Record the commit and test command when reporting a result.
Do not substitute an npm beta dependency for an unpublished package to get an
installation to pass. A public alpha command and versioned migration notes will
be added only after release acceptance and publication.
