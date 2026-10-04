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

The first beta is published. Its one-time changeset included all ten original
public packages. Changesets 3 preserves the numeric alpha counter when its
prerelease tag changes; switching `pre.json` alone does not reset it to zero.
Use `npm run version:packages`: its first-beta adapter validates the complete
official release plan and sets its versions to `0.1.0-beta.0` before the official
applier updates dependencies, changelogs, and archives. Subsequent version steps
use the normal Changesets CLI. This does not create a fixed or linked
version group: later changesets still name only directly affected packages,
with dependency propagation handled by Changesets.

Changesets moves consumed entries
into `.changeset/pre/` for the eventual stable changelog; their presence does
not mean they are waiting to publish again. Preserve these entries and existing
per-package changelog history, including older `v`-prefixed headings.

Choose the release line before consuming pending entries. Main currently
contains 0.2 feature work; a `minor` entry in its existing beta prerelease state
does not automatically produce a 0.2 version. Follow the
[release-line review](../docs/maintainers/release-lines.md), keep 0.1 backports
separate, and freeze a bounded feature batch before its first alpha.

See [the release guide](../docs/maintainers/releases.md) for release PRs,
publication, and recovery. Preparing beta does not publish it. Stable publication
requires a separately reviewed release configuration; prerelease publishing
must not promote packages through `latest`.
