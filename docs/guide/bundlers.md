# Bundler guide

Use Vite for the primary source-authoring path. Rspack and Webpack adapters are
available for experiments and migrations, but their evidence is narrower than
the Vite path.

## Vite (primary)

Install `@vooya/vite` as a development dependency and add `vooya()` after the
host framework plugin. The supported source-authoring range is Vite `>=7 <9`;
Vite 8 is the current primary compatibility target. See the
[getting started guide](./getting-started.md) for complete Vue and React examples.

## Rspack / Rsbuild (experimental)

Use `vooyaRsbuild()` in Rsbuild or `vooyaRspack()` with a direct Rspack config
from `@vooya/rspack`. The named evidence uses Rspack `2.1.10` and Rsbuild
`2.1.13`, with Vue and React browser fixtures plus Rslib output. The current
adapter still exercises the transitional `.voo` fixture path; Rust-file parity,
SSR, Module Federation, and versions below Rspack `2.1.10` are not claims.

## Webpack (experimental)

Use `vooyaWebpack()` from `@vooya/webpack` with Webpack `5`. Fixtures cover
Webpack `5.101.0` and `5.109.2`, production output, browser lifecycle behavior,
and development recovery. Webpack 4, SSR, hydration, Module Federation, and
state-preserving HMR are outside the current boundary.

Check the [compatibility matrix](../project/compatibility.md) and
[tooling reference](../reference/tooling.md) before choosing an experimental path.
