# Troubleshooting

Start with the diagnostic command from the application root:

```sh
npm exec -- vooya doctor
```

## Rust or WASM target errors

Install the target and the exact CLI version used by the current alpha:

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
`allowArbitraryExtensions`; Vooya does not rewrite `tsconfig` for you. Remove
the generated workspace with `vooya clean` if stale declarations remain, then
run the normal build again.

## A failed build leaves the app unusable

Keep the dev server running, fix the reported Rust source line, and save again.
The Vite, Rspack, and Webpack paths are designed to recover after a failed
compilation. A successful Rust rebuild currently causes a full page reload, so
component state is not preserved.

Builds using the same `.vooya` workspace are serialized. Vooya writes a new
WASM result into a temporary staging directory and replaces the previous result
only after compilation, binding generation, and schema validation succeed. If
the rebuild fails, the last successful artifact remains available to the
development server. A concurrent process waits briefly for the workspace lock;
if another process owns it for too long, retry after that build completes.

## Still blocked

Report the exact package versions, Node/Rust/wasm-bindgen versions, framework,
bundler, operating system, command, and a minimal clean-consumer reproduction.
Do not include tokens, private paths, or unrelated logs. The [FAQ](../faq.md)
covers the most common boundary questions.
