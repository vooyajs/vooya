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

The repository is in alpha prerelease mode. Changesets moves consumed entries
into `.changeset/pre/` for the eventual stable changelog; their presence does
not mean they are waiting to publish again. Preserve these entries and existing
per-package changelog history, including older `v`-prefixed headings.

See [the release guide](../docs/maintainers/releases.md) for release PRs,
publication, and recovery. Exiting alpha requires a separately reviewed stable
release configuration; the current publishing command accepts alpha only.
