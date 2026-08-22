# Tooling Reference

## JavaScript output and TypeScript authoring

Vooya packages execute published JavaScript. TypeScript is a repository
development dependency only: it compiles authoring source during package builds
and emits the JavaScript that Vite, Node, and the VS Code extension load.
Installing `@vooya/*` does not require installing TypeScript.

Repository-owned runtime/tooling code is authored in TypeScript. Generated
output, package CLI launchers, consumer fixtures, and compatibility config files
may remain JavaScript when Node or a consumer tool must execute them directly.

## Vite plugin

The public plugin entry is `vooya()` from `@vooya/vite`.

The plugin requires Vite `>=7`. Vite+ is tested as a separate
toolchain because it aliases `vite` to `@voidzero-dev/vite-plus-core`; it still
uses the same `vooya()` plugin and does not create a second Vooya adapter API.
The current Vite+ fixture uses npm legacy peer resolution because its aliased
core has a `0.x` package version; the normal Vite fixtures install strictly.

```ts
vooya({
  framework: "vue",
  rust: {
    dependencies: {
      serde: { version: "1", features: ["derive"] },
      "shared-engine": { path: "rust/shared-engine" },
    },
    webSysFeatures: ["HtmlCanvasElement", "CanvasRenderingContext2d"],
  },
  toolchain: {
    cargoPath: "/opt/custom-rust/bin/cargo",
  },
});
```

`framework` accepts `"vue"` or `"react"` and defaults to `"vue"`. The optional
`toolchain.cargoPath` explicitly selects one Cargo executable. Vooya discovers
the rustc used by that Cargo and rejects the explicit path if its target or
wasm-bindgen CLI is incomplete; it does not fall back to another Cargo on
`PATH`. Relative paths resolve from the Vite project root.

`rust.dependencies` maps Cargo package names to either a version string or an
object. Supported object fields are `version`, `path`, `git`, `branch`, `tag`,
`rev`, `package`, `features`, and `defaultFeatures`. Relative paths resolve from
the Vite application root and are watched during development.

Vooya owns `vooya-core`, `wasm-bindgen`, `js-sys`, and `web-sys` in the
generated crate. Add browser APIs through `rust.webSysFeatures` rather than
overriding `web-sys`.

## Doctor

`vooya doctor` resolves and diagnoses the same coherent Rust/WASM toolchain used
by the Vite process:

```sh
npx vooya doctor
npx vooya doctor --cargo-path /opt/custom-rust/bin/cargo
```

It checks every `cargo` found on `PATH` in order unless `--cargo-path` explicitly
selects one Cargo. An explicit path is authoritative: if it is incomplete,
doctor fails instead of selecting another PATH candidate. For each candidate, Cargo's
verbose `cargo rustc` invocation identifies the rustc that Cargo will use; that
rustc must provide the `wasm32-unknown-unknown` standard library, and the
selected `wasm-bindgen-cli` must be exactly the version required by the alpha.
The report prints all selected executable paths. A non-rustup sysroot is a
warning rather than an error. If a later Cargo candidate is selected because
the first one is incomplete, doctor also warns that this may differ from the
user's PATH preference.

## Generated application workspace

Vite, Rspack, and Webpack use one application-local `.vooya/` workspace:

```text
.vooya/
├── build/        # generated Cargo workspaces and extracted Rust
├── wasm/         # wasm-bindgen JavaScript and WASM output
├── types/        # source-relative *.d.voo.ts and *.d.rs.ts declarations
├── cache/        # bundler-facing generated modules and fingerprints
└── metadata.json # workspace schema, ABI, and toolchain fingerprint
```

Everything inside `.vooya/` is generated, ignored by Git, and safe to
reconstruct while no build is running. Remove it through the supported command:

```sh
npx vooya clean
```

An advanced integration may set `workspace.root` in `vooya()` or
`workspaceRoot` in `vooyaRspack()` or `vooyaWebpack()`; `vooya doctor --workspace-root <path>` and
`vooya clean --workspace-root <path>` accept the same override. Production
bundler assets still belong to the bundler output directory, not `.vooya/`.
TypeScript projects using an override must point `rootDirs` at that workspace's
`types` directory instead of `.vooya/types`.

TypeScript resolves declarations from the mirrored generated tree with
`allowArbitraryExtensions: true` and `rootDirs: [".", ".vooya/types"]`. Vooya
does not rewrite tsconfig files automatically. Rust compiler diagnostics from
extracted files are remapped to the source line in the original `.rs` file or
legacy `.voo` file.
Rust-file declarations use the same central tree and replace `.rs` with
`.d.rs.ts`; they are generated from the versioned `__voo_schema` section after
the WASM build.

The Rust-file Vue and React fixtures are verified end to end with:

```sh
npm run test:rust-vue
npm run test:rust-react
```

This command builds the fixture, serves the production assets with JavaScript
and WASM MIME types, and checks component mounting, store action dispatch, and
the resulting snapshot-driven DOM update in Chromium. The React fixture also
mounts under `StrictMode`.

## Vite development rebuilds

Changes to `.voo`, the bundled Rust runtime, or configured path dependencies
schedule a rebuild. Rapid saves are coalesced. A failed Rust build is reported
through Vite and does not poison the next rebuild.

A successful Rust rebuild currently triggers a full page reload. Component
state is not preserved. Rust-file rebuild, failed-build recovery, and this
full-reload behavior are covered by:

```sh
npm run test:rust-hmr
```

## Rspack and Rsbuild

`@vooya/rspack` exposes `vooyaRsbuild()` for Rsbuild projects and
`vooyaRspack()` for direct Rspack configuration. Both call the same
`@vooya/build-core` Cargo and wasm-bindgen pipeline as Vite.

```ts
import { vooyaRsbuild } from "@vooya/rspack";

vooyaRsbuild({
  framework: "vue",
  rust: { dependencies: { "shared-engine": { path: "rust/shared-engine" } } },
});
```

The minimum supported Rspack version is 2.1.10. Exact evidence comes from that
version and the named Rsbuild/Rslib fixtures. Direct Rspack users must configure
their normal framework and CSS rules in addition to `vooyaRspack().rule()`.

Rspack rebuilds edited `.voo` files and recovers after mapped Rust compilation
errors. Configured Rust path dependencies participate in builds, but editing a
path dependency currently requires restarting the Rspack development server.

## Webpack 5

`@vooya/webpack` uses Webpack's public plugin and loader protocols and delegates
Rust compilation, declarations, diagnostics, and workspace layout to
`@vooya/build-core`.

```js
import { vooyaWebpack } from "@vooya/webpack";

const vooya = vooyaWebpack({
  framework: "vue",
  rust: { dependencies: { "shared-engine": { path: "rust/shared-engine" } } },
});

export default {
  experiments: { asyncWebAssembly: true },
  module: {
    rules: [
      vooya.rule(),
      { test: /\.css$/, use: ["style-loader", "css-loader"] },
    ],
  },
  plugins: [vooya],
};
```

The experimental range is Webpack `>=5`. Exact fixtures cover
5.101.0 production output and 5.109.2 Vue/React browser behavior, mapped Rust
failure recovery, configured path-dependency rebuilds, rapid saves, and normal
Webpack Dev Server live reload. Webpack 4, Module Federation, SSR, hydration,
and state-preserving HMR are not support claims.

## Formatting

`voo-format` canonicalizes the component contract while preserving Rust and CSS
block contents.

```sh
npx voo-format src
npx voo-format --check src
```

The formatter rejects unknown top-level content rather than discarding it.

## VS Code extension

The repository contains the `vooya.voo` extension definition. It associates
`.voo` files with Voo syntax and embeds the native Rust and CSS TextMate
grammars.

```sh
npm run package:editor
code --install-extension dist/voo-vscode.vsix
```

The extension provides syntax highlighting, language configuration, and an
embedded-Rust diagnostics bridge. Run **Vooya: Check Embedded Rust** from the
Command Palette, or save a `.voo` document, to check its extracted Rust with
the locally available `rust-analyzer`; diagnostics are mapped back to the
original `.voo` lines.

This is diagnostics-only. It does not provide rust-analyzer completion,
navigation, rename, or code actions inside a `.voo` document.

For a clean-checkout editor gate, run:

```sh
npm run test:editor
```

That command installs the extension's lockfile-pinned development dependencies
before running its bridge and extension-host tests. It requires a local
`rust-analyzer` and downloads the VS Code test host on its first run.

## Repository verification

The broad local gate is:

```sh
npm run verify:release
```

It checks naming and fixed versions, formats, Rust tests, compiler tests, type
generation, browser E2E behavior, external packed-package builds, HMR recovery,
and npm archive contents. It does not publish packages.
