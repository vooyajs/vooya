# @vooya/preset

Optional managed Rust/WASM tools for Vooya. This package is under development and has not been published.

Declare `@vooya/preset` in your application's `devDependencies`. Vooya's shared toolchain resolver prepares the pinned tools on the first development build, production build, or `vooya doctor` invocation. Installing the npm package itself does not download or execute Rust installers.

The initial pins are Rust **1.94.0**, rustup **1.28.2**, `wasm32-unknown-unknown`, and wasm-bindgen CLI **0.2.115** (matching Vooya's Rust dependency). The minimal Rust profile includes Cargo, rustc and the host standard library. Rustup verifies the Rust component downloads; preset additionally checks pinned SHA-256 hashes before executing rustup or extracting wasm-bindgen. Updating tools requires a preset package update, not a change in the upstream stable channel.

```js
vooya({ toolchain: { mode: "auto" } }) // default: use a declared preset, otherwise system
vooya({ toolchain: { mode: "system" } }) // never prepare managed tools
vooya({ toolchain: { mode: "managed" } }) // require the preset; no silent fallback
```

An explicit `toolchain.cargoPath` continues to select system tools in auto mode. It cannot be combined with managed mode. `VOOYA_TOOLCHAIN=system` selects system tools when the mode is auto, including direct build-core callers. Doctor also accepts `vooya doctor --toolchain system` or `--toolchain managed`.

Tools live under the user's OS cache directory in `vooya/toolchains`; `VOOYA_CACHE_DIR` overrides that directory. Each pinned host/version combination has its own directory. Downloads are streamed, verified, installed into a private staging directory, and renamed into place only on success. A same-host filesystem lock serializes concurrent preparations. A later run recovers a dead installer's lock and staging files. Shared network filesystems are not supported for this cache.

The managed compiler uses an isolated `CARGO_HOME` and `RUSTUP_HOME`. It does not edit shell profiles, system Rust installations, or project manifests. A project's `rust-toolchain.toml`, `RUSTC`, and compiler wrappers do not override the managed compiler; choose system mode when those customizations are needed. Ordinary Cargo project dependency configuration and linker/SDK environment settings still apply.

## Host prerequisites and current scope

Supported download targets: macOS x64/arm64, glibc Linux x64/arm64, and Windows x64 MSVC. musl Linux and Windows arm64 should use system mode for now.

**This does not yet make a machine with only Node.js sufficient.** Rust procedural macros/build scripts run on the host and need a native linker/SDK:

- macOS: Xcode Command Line Tools.
- Linux: a C compiler/linker toolchain and libc development files (for example, `build-essential` on Debian/Ubuntu).
- Windows: Visual Studio Build Tools with the C++ workload and Windows SDK.

These are not installed automatically. Additional native dependencies required by user-selected crates remain the application's responsibility. First use needs access to `static.rust-lang.org`, GitHub release downloads, and the Cargo registry. Later tool selection reuses the cache, while a new project may still fetch Cargo dependencies.

`prepareToolchain({ cacheDirectory?, env? })` is available for explicit integrations and returns the selected Cargo path and subprocess environment. Pass that environment to child processes rather than changing `process.env` globally.
