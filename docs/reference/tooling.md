# Tooling Reference

## JavaScript output and TypeScript authoring

Vooya packages execute published JavaScript. TypeScript is a repository
development dependency only: it compiles authoring source during package builds
and emits the JavaScript that Vite, Node, and the supported framework adapters load.
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

`framework` accepts `"vue"`, `"react"`, `"solid"`, or `"svelte"` and defaults to `"vue"`. The optional
`toolchain.cargoPath` explicitly selects one Cargo executable. Vooya discovers
the rustc used by that Cargo and rejects the explicit path if its target or
wasm-bindgen CLI is incomplete; it does not fall back to another Cargo on
`PATH`. Relative paths written in `vooya({ rust })` resolve from the Vite
application root.

Vooya discovers the nearest `Cargo.toml` by checking the configured `rust.entry`
directory, then `rust.sourceRoot` (default `src`), then the application root,
walking each location toward the repository boundary. Its ordinary
`[dependencies]` become build defaults. This covers regular packages and
workspace members whose dependencies use `workspace = true`. A same-named value in
`vooya({ rust: { dependencies } })` wins; when neither source supplies a value,
the generated crate keeps Vooya's default. Cargo path dependencies resolve from
the manifest directory, while explicit plugin paths resolve from the application
root. Cargo workspace dependencies are also resolved.

`rust.dependencies` maps Cargo package names to either a version string or an
object. Supported object fields are `version`, `path`, `git`, `branch`, `tag`,
`rev`, `package`, `features`, and `defaultFeatures`. Path dependencies and the
discovered manifest are watched during development.

Vooya owns the exact generated-crate versions or sources for `vooya`/`vooya-core`,
`wasm-bindgen`, `js-sys`, and `web-sys` because its Rust runtime and
`wasm-bindgen` CLI must agree. Manifest declarations can still contribute
features, but the current compatibility check is intentionally narrow: it
rejects a conflicting exact managed-version pin and is not a general semver
solver.
When `rust.webSysFeatures` is omitted, features are inherited from the nearest
manifest's `web-sys` dependency. Supplying the option explicitly takes priority.

### `vooya()` options

| Parameter | Type / values | Default | Purpose | Limit / evidence |
| --- | --- | --- | --- | --- |
| `framework` | `"vue" \| "react" \| "solid" \| "svelte"` | `"vue"` | Selects the host adapter | Vue 3 and React 19 are supported; Solid 1.9 and Svelte 5 have experimental Vite 7 evidence; it does not change the Rust ABI |
| `rust.dependencies` | `Record<string, string \| Dependency>` | Nearest `Cargo.toml`, then `{}` | Adds or overrides Cargo registry, Git, or path dependencies | The generated crate owns core browser dependency versions; path edits may require a server restart in experimental adapters |
| `rust.webSysFeatures` | `string[]` | Nearest `Cargo.toml`, then `[]` | Enables the required `web-sys` browser APIs | An explicit array replaces manifest-provided features; built-in runtime features are always retained |
| `toolchain.cargoPath` | `string` | PATH discovery | Chooses the Cargo executable used for the build | The selected Cargo's `rustc`, target, and CLI must be coherent; no silent fallback |
| `workspace.root` | `string` | `.vooya/` | Moves generated build, WASM, types, cache, and metadata | `rootDirs` and cleanup commands must point to the override |

`Dependency` accepts `version`, `path`, `git`, `branch`, `tag`, `rev`,
`package`, `features`, and `defaultFeatures`. Explicit plugin paths resolve from
the application root; inherited Cargo paths resolve from their manifest (or
workspace manifest) directory.

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

### Toolchain modes

| Mode | Cargo selection | Best for | What Vooya guarantees |
| --- | --- | --- | --- |
| Discovered | First coherent Cargo on `PATH` | A normal rustup installation | The build uses the `rustc` selected by that Cargo |
| Explicit | `toolchain.cargoPath` / `--cargo-path` | Multiple Rust installations or Tauri toolchains | An incomplete explicit toolchain fails instead of switching silently |

A project may choose and share its own Cargo policy across native and WASM
builds, but that is project configuration, not a third Vooya-managed toolchain
mode. Managed toolchains and Rust-free precompiled consumers are not current
guarantees.

## Generated application workspace

Vite, Rspack, and Webpack use one application-local `.vooya/` workspace:

```text
.vooya/
├── build/        # generated Cargo workspaces and extracted Rust
├── wasm/         # wasm-bindgen JavaScript and WASM output
├── types/        # source-relative *.d.rs.ts declarations
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

TypeScript resolves Rust-file declarations from the mirrored generated tree with
`allowArbitraryExtensions: true` and `rootDirs: [".", ".vooya/types"]`. Vooya
does not rewrite tsconfig files automatically. Rust compiler diagnostics from
extracted files are remapped to the source line in the original `.rs` file.
Rust-file declarations use the same central tree and replace `.rs` with
`.d.rs.ts`; they are generated from the versioned `__voo_schema` section after
the WASM build.

The Rust-file Vue, React, Solid, and Svelte fixtures are verified end to end with:

```sh
npm run test:rust-vue
npm run test:rust-react
npm run test:rust-solid
npm run test:rust-svelte
```

This command builds the fixture, serves the production assets with JavaScript
and WASM MIME types, and checks component mounting, store action dispatch, and
the resulting snapshot-driven DOM update in Chromium. The React fixture also
mounts under `StrictMode`. The Svelte fixture additionally checks callback and
prop update behavior, generated Svelte declarations, and exactly one Component
handle cleanup plus one generated Store cleanup after child destruction.

## Vite development rebuilds

Changes to `.rs`, the bundled Rust runtime, or configured path dependencies
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

Rspack rebuilds edited Rust source fixtures and recovers after mapped Rust
compilation errors. Configured Rust path dependencies participate in builds, but
editing a path dependency currently requires restarting the Rspack development
server.

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

## Browser verification

The default `npm run test:e2e` command is the short Chromium smoke suite for
Vue, React, and TaskList. The larger DataGrid, scatter-plot, and trace
waterfall scenarios are intentionally manual:

```sh
npm run test:e2e:extended
npm run test:e2e:firefox
```

The repository keeps three explicit verification levels:

```sh
npm run verify:ci       # routine non-browser CI gate
npm run verify:e2e      # browser and bundler E2E, run separately
npm run verify:release  # verify:ci + verify:e2e + release checks
```

Bundler-specific browser checks live in `verify:e2e` because they validate
Webpack, Rspack, and Vite integration rather than duplicate the framework smoke
suite. Routine pull-request CI runs `verify:ci` without Playwright or browser
matrices; the pre-release gate runs both levels.


## Repository verification

The complete local gate is:

```sh
npm run verify:release
```

It checks naming and fixed versions, formats, Rust tests, compiler tests, type
generation, browser E2E behavior, external packed-package builds, HMR recovery,
and npm archive contents. It does not publish packages.
