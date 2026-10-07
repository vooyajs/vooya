# @vooya/preset

Optional managed Rust/WASM tools for Vooya, available starting at `0.2.0-alpha.0`. The host SDK/linker is still required.

Declare `@vooya/preset` in your application's `devDependencies`. Vooya's shared toolchain resolver prepares the pinned tools on the first development build, production build, or `vooya doctor` invocation. Installing the npm package itself does not download or execute Rust installers.

The initial pins are Rust **1.94.0**, rustup **1.28.2**, `wasm32-unknown-unknown`, and wasm-bindgen CLI **0.2.115** (matching Vooya's Rust dependency). The minimal Rust profile includes Cargo, rustc and the host standard library. Rustup verifies the Rust component downloads; preset additionally checks pinned SHA-256 hashes before executing rustup or extracting wasm-bindgen. Updating tools requires a preset package update, not a change in the upstream stable channel.

```js
vooya({ toolchain: { mode: "auto" } }) // default: use a declared preset, otherwise system
vooya({ toolchain: { mode: "system" } }) // never prepare managed tools
vooya({ toolchain: { mode: "managed" } }) // require the preset; no silent fallback
```

An explicit `toolchain.cargoPath` continues to select system tools in auto mode. It cannot be combined with managed mode. `VOOYA_TOOLCHAIN=system` selects system tools when the mode is auto, including direct build-core callers. Doctor also accepts `vooya doctor --toolchain system` or `--toolchain managed`.

Tools live under the user's OS cache directory in `vooya/toolchains`; `VOOYA_CACHE_DIR` overrides that directory. Each pinned host/version combination has its own short, hash-named directory; `ready.json` records its versions. Keeping this directory short avoids unnecessarily exceeding the Windows MSVC linker's path limit. On Windows, custom cache paths should also be kept short. Downloads are streamed, verified, installed into a private staging directory, and renamed into place only on success. A same-host filesystem lock serializes concurrent preparations. A later run recovers a dead installer's lock and staging files. Shared network filesystems are not supported for this cache.

The managed compiler uses an isolated `CARGO_HOME` and `RUSTUP_HOME`. It does not edit shell profiles, system Rust installations, or project manifests. A project's `rust-toolchain.toml`, `RUSTC`, and compiler wrappers do not override the managed compiler; choose system mode when those customizations are needed. Ordinary Cargo project dependency configuration and linker/SDK environment settings still apply.

## Host prerequisites and current scope

Supported download targets: macOS x64/arm64, glibc Linux x64/arm64, and Windows x64 MSVC. musl Linux and Windows arm64 should use system mode for now.

**This does not yet make a machine with only Node.js sufficient.** Rust procedural macros/build scripts run on the host and need a native linker/SDK:

- macOS: Xcode Command Line Tools.
- Linux: a C compiler/linker toolchain and libc development files (for example, `build-essential` on Debian/Ubuntu).
- Windows: Visual Studio Build Tools with the C++ workload and Windows SDK.

These are not installed automatically. Additional native dependencies required by user-selected crates remain the application's responsibility. First use needs access to `static.rust-lang.org`, GitHub release downloads, and the Cargo registry. Later tool selection reuses the cache, while a new project may still fetch Cargo dependencies.

`prepareToolchain({ cacheDirectory?, env? })` is available for explicit integrations and returns the selected Cargo path and subprocess environment. Pass that environment to child processes rather than changing `process.env` globally.

## Package development

Run `npm run build --workspace @vooya/preset` to type-check every implementation
module and generate `lib/*.js` and declarations from `source/*.ts`. The generated
`lib` directory is ignored by Git and included in npm packages. Consumers load
ordinary JavaScript through the existing package exports; no TypeScript loader
is required. `npm test --workspace @vooya/preset` builds before running the
installer regression tests.

## Consumer acceptance

The repository keeps two modes of the same consumer test:

- `npm run test:preset-consumer` builds and installs the current source tarballs.
  Pull requests use this mode on Linux, macOS and Windows, including concurrent
  preparation of a fresh consumer cache. The publisher build uses a separate cache.
- `npm run test:preset-registry` installs the exact published `0.2.0-alpha.0`
  preset/Vite/Vue/provider/build-core packages and `0.1.0-beta.0` core/compiler
  from the public npm registry into a temporary app with a fresh npm cache.
  It needs no local package builds. Its first toolchain command is ordinary
  `npm run dev`; doctor and concurrent cache-reuse checks run afterward.

Both modes exercise a real Component and Store in Chromium, a Rust edit,
compiler error and recovery, and ordinary production build and browser interaction.
They block ambient Rust commands but retain the host SDK/linker. Hosted CI runners
may still have Rust installed; these tests do not certify physically Rust-free hosts.

The existing **Experimental integrations** workflow accepts `managed_source=registry`
for an explicit release-acceptance run of the same three-platform matrix; it skips
unrelated integration jobs. Normal pull requests continue testing source tarballs.
Each registry job starts a fresh managed cache and uploads its result and npm lock.
Do not set `VOOYA_CACHE_DIR` when collecting fresh-cache evidence. For a local
smoke test, that variable can point to an existing cache; the result explicitly
labels it `reused-external-cache`. `VOOYA_PRESET_EVIDENCE_DIR` saves the result
and consumer lock outside the temporary app.

Installer unit tests exercise interrupted HTTP downloads and retry, checksum
failures, staging cleanup and cache locking. Those focused tests are distinct
from interrupting a complete first-time Rust installation. Full-install network
interruption/recovery and physically Rust-free Windows/macOS/Linux qualification
remain separate acceptance work; a successful registry run does not establish them.
