# Releases

Changesets 3.0.3 plans versions, exact internal dependency updates, and
per-package changelogs. Public packages are independently versioned:
`.changeset/config.json` keeps `fixed` and `linked` empty. Do not hand-edit
versions or generated changelogs.

Maintainer tooling requires Node.js `^22.11.0 || ^24.0.0 || >=26.0.0` and npm
`>=10.9.0`; Node.js 24 is recommended. Vite examples require at least Node.js
22.12 on the Node.js 22 line. This does not change the published packages'
Node.js 20 consumer compatibility.

## Contributor changes

Every PR that changes published source, public APIs, or dependencies includes
a `.changeset/*.md` entry naming the directly affected npm packages.
Documentation and test-only changes are exempt. An unrelated or unchanged
pending entry does not cover a new source change.

```sh
npm run changeset
npm run release:status
```

Use standard Changesets syntax:

```md
---
"@vooya/build-core": patch
---

Resolve named Rust types within their source module so unrelated types sharing
one name cannot silently produce the wrong TypeScript declaration.
```

Use `patch`, `minor`, or `major` according to the public impact. Describe the
behavior and any migration steps, rather than copying a commit title or progress
report. Name directly changed packages only; Changesets handles dependency
propagation. CI checks coverage, structure, and nonempty content. Reviewers
remain responsible for the accuracy of the summary and bump severity.

## Release pull request

When changesets reach `main`, the **Release** workflow creates or updates a
release PR with the version plan, package changelogs, exact dependency updates,
and synchronized lockfile. The version step also records the exact candidate
package versions in `.changeset/release.json`. Review these files together.
Source changes and their release version changes belong in separate PRs.

The version job uses the official Changesets action to maintain the PR. Because
pull requests created with `GITHUB_TOKEN` do not trigger normal pull-request
workflows, it explicitly dispatches **Verify** for the generated release branch.
Repository Actions settings must enable **Allow GitHub Actions to create and
approve pull requests**. The version job explicitly grants `contents: write`,
`pull-requests: write`, and `actions: write`; it uses the repository token and
does not require a separate personal access token.

For a local preview of the same version operation, use an isolated checkout:

```sh
npm run release:status
npm run version:packages
```

The version command edits files but does not publish. Keep the generated
output reviewable; do not manually force every package to the same version.
Changesets 3 moves consumed prerelease entries into `.changeset/pre/`, where
they remain available for the eventual stable changelog. They are not pending
changesets and must not be treated as a reason to republish a package.

Every public package must have a nonempty changelog section for its current
version. Release checks reject downgrades, rewritten or reordered historical
sections, and fabricated past releases. Existing `v`-prefixed headings are
preserved. The migration to Changesets records the still-unpublished ABI and
declaration fixes from [#122](https://github.com/vooyajs/vooya/pull/122) and
[#125](https://github.com/vooyajs/vooya/pull/125), plus workspace rebuild recovery
from [#108](https://github.com/vooyajs/vooya/pull/108); it does not invent
changesets for already published history.

## Publish alpha

Merging the reviewed release PR triggers the **Release** workflow on `main`.
Its separate publishing job runs only when that commit changes the generated
`.changeset/release.json` and no pending changesets remain. Ordinary source
merges prepare a release PR instead of publishing directly.

The publishing command is `npm run release:alpha`. That command writes to npm;
`release:status` and `version:packages` do not publish. The command accepts
alpha versions only.

Publication uses the same commit that passes the complete release gate:

1. Require a clean release checkout and no pending changesets.
2. Run `verify:release`, including browser and bundler acceptance, build the
   packages, and recheck the commit and checkout before publication.
3. Capture the existing npm `latest` tags as the retry baseline.
4. Use the Changesets publish plan, pack, and publish commands for only the
   recorded candidates, forcing the `alpha` tag. Publish packed artifacts with
   Git tagging disabled, skipping exact versions already present on npm.
5. Verify each expected registry version and its exact internal dependencies,
   synchronize and check its `alpha` tag, and preserve the original `latest`
   baseline. Registry propagation checks use bounded retries.
6. Install clean Vue and React consumers from the registry and verify their
   resolved versions and dependency graph against the release checkout.
7. Save a commit-linked receipt and package notes under
   `.vooya-tools/release/<commit>/`. CI retains this evidence, including the
   original tag baseline, on failure as well as success.

Only after registry and consumer acceptance succeeds does the workflow create
each candidate package's GitHub Release from its generated changelog section
and package-version Git tag. This step is idempotent: a retry can create a
missing announcement even if npm already has that candidate version. Alpha
GitHub Releases are marked as prereleases. The verified receipt also
includes unchanged packages; it must not be interpreted as a list of packages
newly published in that run.

Registry preflight is not publication proof. Post-publication checks require
the exact expected versions and tags; missing packages fail. Registry source
consumer builds and packed browser tests are separate evidence: installing a
registry package does not by itself prove browser behavior.

## Recover partial publication

Keep the same release commit and exact versions. Inspect the failed step; do
not bump versions again, unpublish successful packages, or move `latest` to
hide a partial release. Fix the failed prerequisite and rerun the workflow.
If the original `latest-before.json` baseline is missing and any candidate version
already exists on npm, fresh baseline capture fails closed, even in a new manual
workflow run. Restore the baseline from that release SHA’s uploaded artifact
before retrying; an existing baseline is never overwritten.
Changesets skips already published npm versions and publishes the missing set.

A local retry retains its original `latest-before.json`. CI restores the
baseline using a key for the exact release commit and saves it before any npm
mutation. Retry the same commit so both the recorded candidates and tag baseline
remain available. If that cache is unavailable, recover the original baseline
from the failed run's uploaded evidence before retrying. Restore any incorrectly
changed tags to that baseline; a freshly captured baseline cannot prove what
the tags were before the failed attempt.
New packages need an explicit initial `latest` decision because npm can create
that tag on first publication.

Check GitHub Releases separately after a failed run. A package may already be
published on npm while its GitHub Release is missing. Rerunning the same plan
rechecks registry acceptance and creates missing announcements without
republishing existing npm versions. Do not create a new version merely to
recreate an announcement.

## Beta and stable

This workflow retains the alpha publication boundary. Moving to beta or the
first stable `0.1.0` requires a separate review of the prerelease state,
publication command, dist-tag checks, and transition tests. Exiting Changesets
prerelease mode alone does not authorize publication through `latest`.
The current alpha publishing command deliberately rejects stable versions.
