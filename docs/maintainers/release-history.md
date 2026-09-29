# Historical release evidence

The package changelogs were backfilled from public npm metadata, published
tarballs, repository release snapshots, and the changes between those snapshots.
This is a documentation repair, not a new release. The entries use exact version
headings accepted by Changesets. No publication dates have been inferred from
Git commit dates, and a coordinated version bump is distinguished from a package
implementation change.

## Published package boundaries

The npm version lists establish these histories:

| Package | Published alpha versions covered |
| --- | --- |
| `@vooya/core`, `@vooya/react`, `@vooya/vue` | alpha.0 through alpha.12 |
| `@vooya/compiler` | alpha.4 through alpha.12 |
| `@vooya/build-core`, `@vooya/rspack` | alpha.8 through alpha.13 |
| `@vooya/vite` | alpha.9 through alpha.13 |
| `@vooya/webpack` | alpha.9 through alpha.13 |
| `@vooya/solid`, `@vooya/svelte` | alpha.12 only |
| `@vooya/vite-plugin` (former package name) | alpha.0 through alpha.8 |

The Vite changelog retains the old package's history and labels it explicitly.
An alpha.8 section there does not mean `@vooya/vite@0.1.0-alpha.8` was published.
Likewise, there are no alpha.13 entries for compiler, core, or the framework
adapters, because those versions were not published.

Public metadata can be reproduced without installing or executing a package:

```sh
npm view @vooya/build-core versions --json --registry=https://registry.npmjs.org
npm view @vooya/build-core@0.1.0-alpha.13 version gitHead dependencies dist --json --registry=https://registry.npmjs.org
```

Use the corresponding package name for each row. The registry documents for
[build-core](https://registry.npmjs.org/@vooya%2fbuild-core),
[compiler](https://registry.npmjs.org/@vooya%2fcompiler),
[core](https://registry.npmjs.org/@vooya%2fcore),
[React](https://registry.npmjs.org/@vooya%2freact),
[Rspack](https://registry.npmjs.org/@vooya%2frspack),
[Solid](https://registry.npmjs.org/@vooya%2fsolid),
[Svelte](https://registry.npmjs.org/@vooya%2fsvelte),
[Vite](https://registry.npmjs.org/@vooya%2fvite),
[Vue](https://registry.npmjs.org/@vooya%2fvue),
[Webpack](https://registry.npmjs.org/@vooya%2fwebpack), and the
[former Vite plugin](https://registry.npmjs.org/@vooya%2fvite-plugin)
contain the version-specific manifests. Internal dependency notes in the
changelogs use those published manifests, rather than assuming all packages
had the same version or that every transitive package was a direct dependency.

## Source snapshots and limits

| Version | Evidence used for the source boundary |
| --- | --- |
| alpha.0 | npm records `gitHead` `8ba7902064770e24a9c7f35e9673d8dca069fc4e`, which was unavailable in the local repository. Entries only describe the initial package exports verified from the published tarballs; no source diff is attributed to this commit. |
| alpha.1 | npm `gitHead` [`82ff6d7`](https://github.com/vooyajs/vooya/commit/82ff6d7f40e6b00681e5bfe2e386f1ea6a009372); describe the shipped source-authoring APIs without claiming an exact diff from the unavailable alpha.0 source. |
| alpha.2 | npm `gitHead` [`4a76530`](https://github.com/vooyajs/vooya/commit/4a76530ea3993b6b1e57539be4e0793f1255560f) |
| alpha.3 | npm `gitHead` [`3c2c4b0`](https://github.com/vooyajs/vooya/commit/3c2c4b09bf9958be24e1fa5028757615716a0ec5) |
| alpha.4 | npm `gitHead` [`8109364`](https://github.com/vooyajs/vooya/commit/8109364f7f96437d7ec13a023a5874f2591c3f96) |
| alpha.5 | npm `gitHead` [`582e276`](https://github.com/vooyajs/vooya/commit/582e2761d2be57bb9de2bd87de78f059717e9fdb) |
| alpha.6 | npm `gitHead` [`670b73e`](https://github.com/vooyajs/vooya/commit/670b73e42141b576c278e96568a4514e251ca12e) |
| alpha.7 | npm `gitHead` [`7af6cee`](https://github.com/vooyajs/vooya/commit/7af6cee5154e3f2fc005bf8faf11d1246f4babdb) |
| alpha.8 | npm versions/manifests and repository tag [`v0.1.0-alpha.8`](https://github.com/vooyajs/vooya/tree/v0.1.0-alpha.8); these npm manifests do not record `gitHead`. |
| alpha.9 | npm versions/manifests and repository tag [`v0.1.0-alpha.9`](https://github.com/vooyajs/vooya/tree/v0.1.0-alpha.9); these npm manifests do not record `gitHead`. |
| alpha.10 | npm `gitHead` [`d9c6434`](https://github.com/vooyajs/vooya/commit/d9c64348b1412afa80bd3d12486a558585d41e5a), rather than assuming the version tag is the exact publication commit. |
| alpha.11 | npm versions/manifests and repository tag [`v0.1.0-alpha.11`](https://github.com/vooyajs/vooya/tree/v0.1.0-alpha.11); these npm manifests do not record `gitHead`. |
| alpha.12 | All ten package manifests record npm `gitHead` [`e8eb575`](https://github.com/vooyajs/vooya/commit/e8eb5754a388573770dc60892d2f061061e12e2d). |
| alpha.13 | Only build-core, Vite, Rspack, and Webpack were published; all four record npm `gitHead` [`33e7d90`](https://github.com/vooyajs/vooya/commit/33e7d905abd928e242bffb2a4312e8e8a2e943d7). |

Missing npm `gitHead` values are not silently filled in: repository tags provide
the historical source context, not npm-attested provenance. For example, the
alpha.12 changes are inspected from `v0.1.0-alpha.11` to `e8eb575`, and alpha.13
from `e8eb575` to `33e7d90`. The latter changes the shared Rust module handling
and Vite invalidation; Rspack and Webpack receive the build-core dependency
update while compiler and core stay at alpha.12.

## Attribution corrections

Earlier changelogs repeated repository-wide release summaries in every package.
The repaired entries keep the applicable behavior and explain dependency-only
releases, rather than claiming that every adapter added every new framework.
Solid's initial adapter description belongs to its published alpha.12 section,
not a second `Unreleased` section.

The alpha.12/alpha.13 boundaries precede the concrete named-schema declaration
work in PR #122, the schema-group fix in PR #125, and the failed-build artifact
preservation work in PR #108. Those changes must receive their own future
release entries; this backfill does not attach them to already published npm
versions. The in-place component update hook in alpha.12 is the earlier PR #113
macro change, not the later declaration fixes.
