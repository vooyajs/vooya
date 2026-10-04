# Troubleshooting

This guide targets the [published beta](../project/status.md). If a main-branch
example mentions a managed preset, Octane or SSR, check its
[unreleased availability](../project/next-release.md) before changing your setup.

Start with the diagnostic command from the application root:

```sh
npm exec -- vooya doctor
```

## Rust or WASM target errors

Install the target and the exact CLI version used by the current beta:

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.115 --locked
```

The authoring macro uses `proc-macro2` span locations to report the Rust source
file. That API is available on stable Rust 1.88 and newer when the
`span-locations` feature is enabled. Vooya's supported path is a current stable
Rust toolchain; if an older or pinned toolchain reports that `Span::file()` is
missing, check `cargo tree -i proc-macro2`, refresh the lockfile if appropriate,
and run `vooya doctor` with the same Cargo that performs the build.

If multiple Rust installations are present, pass the intended Cargo with
`vooya doctor --cargo-path <path>` and the matching `toolchain.cargoPath` option.
Vooya follows the `rustc` selected by Cargo; it does not silently combine an
unrelated `rustc` with that Cargo.

## Restricted networks and regional mirrors

If `rustup` or Cargo cannot reach their official endpoints, use a mirror that
is available in your region. For users in mainland China, TUNA provides a
commonly used Rust distribution mirror:

```sh
export RUSTUP_DIST_SERVER=https://mirrors.tuna.tsinghua.edu.cn/rustup
export RUSTUP_UPDATE_ROOT=https://mirrors.tuna.tsinghua.edu.cn/rustup/rustup
```

For crates.io downloads, configure Cargo in `$CARGO_HOME/config.toml` (usually
`~/.cargo/config.toml`):

```toml
[source.crates-io]
replace-with = "tuna"

[source.tuna]
registry = "sparse+https://mirrors.tuna.tsinghua.edu.cn/crates.io-index/"
```

These settings affect the whole Cargo installation, not just Vooya. Check the
mirror's current documentation and your organization's policy before applying
them, and remove the override when you need to reproduce an upstream registry
issue. Vooya still uses the Cargo and rustc selected by your environment.

## Windows linker errors

For an MSVC Rust host, install Visual Studio Build Tools with **Desktop
development with C++** and a Windows SDK. Reopen the terminal so `link.exe` is
available to Cargo.

## TypeScript cannot find a generated declaration

Declarations are written under `.vooya/types`, not beside the `.rs` file. Add
that directory to the application's `rootDirs` and enable
`allowArbitraryExtensions`; Vooya does not rewrite `tsconfig` for you. Stop active builds and remove
the generated workspace with `vooya clean` if stale declarations remain, then
run the normal build again.

## A failed build leaves the app unusable

Keep the dev server running, fix the reported Rust source line, and save again.
The published Rust-file Vite path recovers after failed compilation.
Webpack/Rspack Rust-file recovery is part of the unreleased 0.2 source tests. A successful Rust rebuild currently causes a full page reload, so
component state is not preserved.

Builds using the same `.vooya` workspace are serialized. Vooya prepares WASM,
JavaScript, schema, CSS, declarations, and metadata before replacing the previous
output. If preparation or installation fails, the last successful artifact and
metadata are retained or restored. This recovery covers reported build failures;
it is not a transaction across a process crash or power loss.

The workspace lock is published with its owner already recorded. Recovery of a
dead process only removes that owner's entry, so it cannot delete another
process's replacement lock. An owner whose process still exists is never evicted
on age alone. Builds still use the synchronous API: a contending call waits for
up to 30 seconds and then reports a busy workspace. Retry after the other build
finishes. Independent workspaces do not share this lock.

## A source file is missing from generated output

On published beta, use a source directory without trailing dot segments, such
as `rust` rather than `rust/.`. Keep application sources in a dedicated directory
instead of scanning the project root. Root normalization and excluding dependency
directories are [maintenance candidates](../maintainers/release-lines.md#maintenance-backport-candidates),
not released fixes. Check the exact package version before assuming a main-branch
regression test covers your installation.

## A React Store factory throws before `onError` runs

The published React adapter can let a synchronous factory throw escape its
creation-error callback. When using the advanced factory API, an `async` wrapper
turns such a throw into a rejected Promise handled by that API. Preserve the
factory arguments and return type; do not suppress the error. The focused fix
is a 0.1 maintenance candidate, not an available package update.

## Still blocked

Report the exact package versions, Node/Rust/wasm-bindgen versions, framework,
bundler, operating system, command, and a minimal clean-consumer reproduction.
Do not include tokens, private paths, or unrelated logs. The [FAQ](../faq.md)
covers the most common boundary questions.
