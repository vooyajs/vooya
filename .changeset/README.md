# Changesets

Vooya uses Changesets 3.0.3. Add an entry to every PR that changes published
source, public APIs, or package dependencies:

```sh
npm run changeset
```

Use the full npm package name and a standard bump type:

```md
---
"@vooya/build-core": patch
---

Resolve named Rust types within their source module when generating TypeScript
declarations, preserving the correct shape when modules reuse a type name.
```

Name directly changed packages only. Packages are independently versioned;
`fixed` and `linked` are empty. Changesets propagates required updates through
exact internal dependencies. Documentation and test-only changes need no entry.

Write a concrete user-facing summary and describe any migration requirements.
Use `patch`, `minor`, or `major` according to the public impact. Keep generated
versions and changelogs in the release PR instead of editing them in a source PR.

The release target is explicit in `.changeset/line.json`: `baseVersion`,
`channel`, and the publishing `branch`. Its channel must match `pre.json`.
The current feature line targets `0.2.0-alpha.N` on `main`; maintenance targets
`0.1.0-beta.N` on `release/0.1`. New packages in the current feature batch start
at `0.2.0-alpha.0`. Unchanged packages retain their versions.

Use `npm run release:status` to preview the reviewed plan and
`npm run version:packages` to apply it. The wrapper adjusts the target base and
channel, checks increasing versions and dependency propagation, and delegates
manifest, changelog and archive writes to the official Changesets applier.
Repeating versioning without new changesets must leave the output unchanged.
Do not invoke `changeset version` directly to bypass the release-line review.

The first beta is already published. The historical all-package alpha-to-beta
adapter remains available for replaying releases without a line configuration;
it is not the current feature-line plan.

Changesets moves consumed entries
into `.changeset/pre/` for the eventual stable changelog; their presence does
not mean they are waiting to publish again. Preserve these entries and existing
per-package changelog history, including older `v`-prefixed headings.

Choose the release line before consuming pending entries. Main contains 0.2 feature work; a
`minor` entry alone does not select a new numeric prerelease base. Follow the
[release-line review](../docs/maintainers/release-lines.md), keep 0.1 backports
separate, and freeze a bounded feature batch before its first alpha.

See [the release guide](../docs/maintainers/releases.md) for release PRs,
publication, and recovery. Preparing beta does not publish it. Stable publication
requires a separately reviewed release configuration; prerelease publishing
must not promote packages through `latest`.
