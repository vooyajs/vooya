# 0.2 alpha: opt-in installation and scope

The [0.2 alpha release run](https://github.com/vooyajs/vooya/actions/runs/37315595525) publishes eight packages at
`0.2.0-alpha.0`: `@vooya/vite`, `@vooya/vue`, `@vooya/react`, `@vooya/build-core`,
`@vooya/provider-rust`, `@vooya/preset`, `@vooya/rspack`, and `@vooya/webpack`.
`@vooya/core` and `@vooya/compiler` remain at `0.1.0-beta.0`; Solid and Svelte
adapters remain at `0.1.0-beta.2`. Use this exact mixed version graph; there is no
Solid/Svelte alpha package in this release. Octane remains private and deferred.

The publication run passed the complete `verify:release` gate and published all
eight packages, but its registry-propagation check timed out and the workflow
finished with failure. It is not an all-green release run. See the
[publication and recovery record](../maintainers/releases/0.2.0-alpha.0.md) for
the preserved original baseline, independent receipt and exact registry checks.
Local Vue/React registry consumers and a separate preset registry consumer passed;
the preset check reused its managed cache and does not establish a fresh download.


The default quickstart continues to use beta. Alpha is an explicit opt-in for the
managed toolchain, bounded Vite 8/Vite+ and Rust bundler paths, and SSR-safe
client-mounted islands. See [package status](./status.md).
Publication does not establish every framework or SSR combination, and a source
fixture is not by itself a registry-consumer test.

## Install into an existing Vite application

Keep the host framework plugin and the Rust example from the [beta quickstart](../guide/getting-started.md).
Select one adapter; do not install both unless the application actually uses both.

```sh
npm install -D @vooya/vite@0.2.0-alpha.0
# Vue
npm install @vooya/vue@0.2.0-alpha.0
# Or React
npm install @vooya/react@0.2.0-alpha.0
# Optional: pinned managed Rust/WASM tools
npm install -D @vooya/preset@0.2.0-alpha.0
npx vooya doctor --json
npm run dev
# After checking the app and generated declarations, stop dev with Ctrl+C.
npm run build
```

Solid/Svelte applications keep their adapter at `0.1.0-beta.2` and use
`@vooya/vite@0.2.0-alpha.0`; do not request a nonexistent adapter alpha. Node and host-plugin
requirements still follow the [compatibility matrix](./compatibility.md).
`0.2.0-alpha.0` is the Vooya plugin version; the host bundler is Vite 7 or 8.
The preset is optional. Without it, install the system Rust target and matching
wasm-bindgen CLI as in the quickstart. With it, the host SDK/linker is still required.
Application authors do not need a direct provider-rust dependency.

## Managed Rust toolchain

The alpha Vite/Rust integrations can discover an optional `@vooya/preset` dependency declared in
the application or an ancestor project. It prepares pinned Rust/WASM tools in
an isolated cache. It still compiles Rust locally and requires the host linker
and SDK where applicable. The preset is not a Rust-free component runtime.

These settings are available **since 0.2.0-alpha.0**:

| Setting | Alpha behavior |
| --- | --- |
| `toolchain.mode: "auto"` (default) | Uses a declared preset when present; otherwise uses system discovery. An explicit `cargoPath` selects system tools. |
| `toolchain.mode: "system"` | Uses installed system tools without preparing a preset. |
| `toolchain.mode: "managed"` | Requires the project's preset; an explicit `cargoPath` is an error. |
| `VOOYA_TOOLCHAIN` | Selects the mode when the configured mode is `auto`. |
| `vooya doctor --toolchain auto\|system\|managed` | Diagnoses the same alpha selection policy. |

If managed preparation fails, inspect the installer error and retry after
correcting the download or host prerequisite. Vooya does not silently fall
back to system tools. Choose `system` explicitly when that is your intent.
The [preset source README](https://github.com/vooyajs/vooya/blob/main/packages/preset/README.md)
records cache and platform details. Published beta users should continue using
[system toolchain diagnostics](../reference/tooling.md#doctor).

The source acceptance command is `npm run test:preset-consumer`. It installs
seven matching tarballs into a separate Vue application, then checks ordinary
`npm run dev`, browser Component/Store interaction, Rust edits, compiler error
recovery, and `npm run build`. Ambient Rust commands are blocked while the host
SDK/linker remains available. The same test runs on Linux, macOS and Windows in
CI with a fresh managed cache; a local reused cache does not verify downloads.

## Host integrations

| Integration | Named fixture evidence and remaining boundary |
| --- | --- |
| Vite 8.2.1 | Vue/React/Solid/Svelte packed production and dev consumers, strict declarations, Rust error recovery, rapid saves and host edits. |
| Vite+ 0.2.9 | Four-framework packed dev/build fixtures with the documented aliases and overrides. Normal npm peer resolution; no claim for all Vite+ tools or versions. |
| Webpack/Rspack `.rs` authoring | Vue/React components, Stores, CSS and declarations; Vue watch recovery and new-module checks. Other watch/framework combinations remain unverified. |
| SSR-safe islands | Vue lazy Store creation and React client boundaries; named Nuxt production/browser fixture. Rust content still mounts in the browser; Next.js is unverified. |

See [source compatibility evidence](./compatibility.md#current-source-browser-fixtures),
[experimental setup](../guide/other-integrations.md#vite), and the
[SSR boundary](./ssr-roadmap.md). Use the exact installation graph above. The named source tests describe coverage;
they do not imply that arbitrary newer main commits have been published.

## Octane is deferred

The native Octane adapter remains a private workspace experiment, with its own
packed browser test. It is excluded from this 0.2 alpha release and
public release gate. Do not install an unpublished `@vooya/octane` version.
Making it public later requires explicit scope review, a first-release
Changeset and registry acceptance; keeping the implementation does not commit
to a release date.

## Rust provider extraction

[PR #148](https://github.com/vooyajs/vooya/pull/148) separates the Rust build
implementation into `@vooya/provider-rust`. `@vooya/build-core` remains a
compatibility entry point. The extraction is merged through
[PR #149](https://github.com/vooyajs/vooya/pull/149) and preserves exported functions, type
identity and build artifacts; it does not add a public multi-language provider
registry or a new artifact protocol. Neither the new package nor this
extraction is part of the published 0.1 beta.

## Reproducing source evidence

The named repository tests build matching tarballs from a reviewed checkout.
Record the commit and command; a later main build may include changes absent from
alpha.0. For installed applications, use the exact registry versions above.
Publication and official-site deployment are separate operations; a merged docs
change alone is not evidence that the public site serves it.
