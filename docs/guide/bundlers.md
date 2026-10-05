# Bundler guide

Use Vite for the primary source-authoring path. Rspack and Webpack adapters are
published as experimental packages. Their beta evidence uses the
retired `.voo` format; Rust-file integration requires the
[opt-in 0.2 alpha](../project/next-release.md).

## Vite (primary)

Install `@vooya/vite` as a development dependency and add `vooya()` after the
host framework plugin. The supported source-authoring range is Vite `>=7 <9`;
Vite 8 is the current primary compatibility target. See the
[getting started guide](./getting-started.md) for Vue, React, and experimental
Solid/Svelte examples. Solid/Svelte beta evidence uses Vite 7; the alpha graph adds the named Vite 8 fixtures.

## Rspack / Rsbuild (experimental)

Use `vooyaRsbuild()` in Rsbuild or `vooyaRspack()` with a direct Rspack config
from `@vooya/rspack`. The named evidence uses Rspack `2.1.10` and Rsbuild
`2.1.13`, with Vue and React browser fixtures plus Rslib output. The beta
adapter exercises the transitional `.voo` fixture path. Current-source
`test:rust-bundlers` adds Vue/React `.rs` components, Stores and declarations,
plus Vue watch recovery. Those additions are not in npm beta. SSR, Module
Federation and versions below Rspack `2.1.10` remain outside the claim.

## Webpack (experimental)

Use `vooyaWebpack()` from `@vooya/webpack` with Webpack `5`. Fixtures cover
Webpack `5.101.0` and `5.109.2`, production output, browser lifecycle behavior,
and development recovery on transitional fixtures. Current-source
`test:rust-bundlers` adds the same bounded Rust-file coverage as Rspack; it
requires the alpha.0 package set. Webpack 4, SSR, hydration, Module Federation, and
state-preserving HMR are outside the current boundary.

Check the [compatibility matrix](../project/compatibility.md) and
[tooling reference](../reference/tooling.md) before choosing an experimental path.
