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

If multiple Rust installations are present, pass the intended Cargo with
`vooya doctor --cargo-path <path>` and the matching `toolchain.cargoPath` option.
Vooya follows the `rustc` selected by Cargo; it does not silently combine an
unrelated `rustc` with that Cargo.

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

## Still blocked

Report the exact package versions, Node/Rust/wasm-bindgen versions, framework,
bundler, operating system, command, and a minimal clean-consumer reproduction.
Do not include tokens, private paths, or unrelated logs. The [FAQ](../faq.md)
covers the most common boundary questions.
