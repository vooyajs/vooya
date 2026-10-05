# Releases

::: warning Prepare a candidate before publishing
Source changes and version changes belong in separate reviewed PRs. The main
branch is the 0.2 feature line; it must not be published as 0.1 maintenance.
Read the [current release-line review](./release-lines.md) before preparing a
candidate. A source merge or successful version preview does not authorize
publication.
:::

Changesets 3.0.3 plans exact internal dependency updates and per-package
changelogs. Packages remain independently versioned: `fixed` and `linked` are
empty. Do not hand-edit package versions or generated changelogs.

`.changeset/line.json` makes the target explicit:

| Branch | Base version | Channel | Purpose |
| --- | --- | --- | --- |
| `main` | `0.2.0` | `alpha` | Current feature batch; new packages start at `0.2.0-alpha.0` |
| `release/0.1` | `0.1.0` | `beta` | Fixes to published 0.1 beta behavior |

The file's `channel` must match `.changeset/pre.json`. Use the repository's
`release:status` and `version:packages` commands: they review the target versions
before the official Changesets applier writes manifests, exact dependency pins,
changelogs and consumed-entry archives. They retain unchanged packages, reject
version regressions and keep repeated versioning without new changesets a no-op.
Changing the prerelease tag alone is not a minor-version transition.

The first 0.1 beta is already published; its historical transition remains a
regression fixture. Stable publication is not enabled. Installation guides
continue using published `beta` packages until the new alpha is accepted and
published.

Use Node.js 22.22.2 or newer on the 22.x line with npm 10.9.x for release
preparation. The repository's current Octane and JSDOM dependencies require
that Node minimum; the release workflow selects the current Node 22 release. Although Changesets also supports newer Node versions,
npm 11 currently rewrites optional peer entries differently from the CI npm 10
lockfile; do not regenerate release lockfiles with npm 11. This does not change
the published packages' Node.js 20 consumer compatibility.

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

The project `.npmrc` fixes the public npm registry and enables normal peer
dependency resolution. CI checks every lockfile tarball URL and integrity before
installing, so a maintainer’s private registry cannot leak into the public lockfile.

## Release pull request

After collecting a reviewed batch, manually dispatch the **Release** workflow
on `main` or `release/0.1` with `action=prepare` and the full branch-head `sha`.
It creates or updates a release PR with the version plan, package changelogs,
exact dependency updates, and synchronized lockfile. Ordinary pushes do not
prepare or publish releases. The version step also records the exact candidate
package versions in `.changeset/release.json`. Review these files together.
Source changes and their release version changes belong in separate PRs.

The version job uses the official Changesets action to maintain the PR. Because
pull requests created with `GITHUB_TOKEN` do not trigger normal pull-request
workflows, it dispatches **Verify** for the generated release branch only when
that exact PR head has no existing Verify run. Inspect or rerun a failed run
instead of dispatching duplicates.
Repository Actions settings must enable **Allow GitHub Actions to create and
approve pull requests**. The version job explicitly grants `contents: write`,
`pull-requests: write`, and `actions: write`; it uses the repository token and
does not require a separate personal access token.

An organization owner must first permit this setting under **Organization
Settings → Actions → General → Workflow permissions**. A repository admin then
enables it under **Repository Settings → Actions → General → Workflow
permissions**. Repository job permissions cannot override an organization-level
prohibition. If GitHub reports that the organization does not allow Actions to
create or approve pull requests, changing the workflow's `permissions` alone
will not fix it.

The **Create or update release PR** step fails with GitHub's API error when PR
creation is denied. That failure is not ignored: the version job fails, the
prepare operation stops. Publication is a separate explicit dispatch. A pushed
version branch alone is not a successfully prepared release PR.

While an owner resolves the policy, a maintainer with normal push and PR rights
can prepare the same version PR manually. This example targets the feature
line; for maintenance, use `origin/release/0.1` and `--base release/0.1`.
Start from a fresh worktree, confirm
its Git author/committer use your public-project identity, and run:

```sh
git fetch origin main
git worktree add -b feat/release-packages ../vooya-release-preview origin/main
cd ../vooya-release-preview
npm ci
npm run release:status
npm run version:packages
npm run verify:changes -- --base origin/main
npm run test:release-contract
git diff --stat
git diff -- .changeset packages package-lock.json
```

Review the exact candidate versions, dependency pins, changelog entries, and
archived changesets before committing. If the version command reports no pending
changes, stop instead of opening an empty version PR. Once the diff is correct:

```sh
git add .changeset packages/*/package.json packages/*/CHANGELOG.md package-lock.json
git commit -m 'chore: release packages'
git push -u origin feat/release-packages
gh pr create --base main --head feat/release-packages --title 'chore: release packages' --body 'Consume pending changesets into reviewed package versions, dependency pins, and per-package changelogs.'
```

A PR created with the maintainer's normal GitHub credentials triggers ordinary
PR checks. Wait for those checks and review before merging. These commands do
not publish, and merging the version PR does not publish either. Publication
requires a separate dispatch of the reviewed release commit and its complete
release gate. The manual route does not skip verification or enable stable
versions.

For a local preview of the same version operation, use an isolated checkout:

```sh
npm run release:status
npm run version:packages
```

The version command edits files but does not publish. Keep the generated
output reviewable; do not manually force every package to the same version.
The initial beta's coordinated versions come from its all-package changeset,
not manual edits or permanent version grouping.
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

## Publish alpha or beta

After merging and reviewing the version PR, manually dispatch **Release** on
its configured release branch with `action=publish` and the complete reviewed
`sha`. The SHA must equal the selected branch head, change the generated
`.changeset/release.json`, and have no pending changesets. Source merges never
publish automatically.

Use `npm run release:beta` for the beta channel or `npm run release:alpha` for
alpha. Both commands write to npm and explicitly guard the selected channel
against `.changeset/pre.json` and the candidate versions. They cannot publish
stable versions. `release:status` and `version:packages` do not publish.
Do not invoke a publishing command as part of preparing or pushing the beta
changes; publication follows a separately reviewed version PR.

Publication uses the same commit that passes the complete release gate:

1. Require a clean release checkout and no pending changesets.
2. Run `verify:release`, including browser and bundler acceptance, build the
   packages, and recheck the commit and checkout before publication.
3. Capture `latest` and the other prerelease channel as the retry baseline:
   alpha protects beta, and beta protects alpha. Also preserve same-channel
   tags for unchanged packages. Verify the original baseline before publishing.
4. Use the Changesets publish plan, pack, and publish commands for only the
   recorded candidates, forcing the selected `alpha` or `beta` tag. Publish packed artifacts with
   Git tagging disabled, skipping exact versions already present on npm.
5. Verify each expected registry version and its exact internal dependencies,
   synchronize and check only the candidates' selected-channel tags, and
   verify that protected tags remain at the original baseline. Unchanged
   dependencies can remain on the other channel and are checked by exact
   version. An older retry must not roll a newer channel tag back. Registry
   propagation checks use bounded retries.
6. Install clean Rust-file Vue and React consumers from the registry and
   verify their exact resolved versions and dependency graph against the
   release checkout. Require strict TypeScript checks, production builds, and
   Chromium interaction. Run the corresponding clean, locally packed consumer
   acceptance before publication; it does not replace registry acceptance.
7. Save a commit-linked receipt and package notes under
   `.vooya-tools/release/<commit>/`. CI retains this evidence, including the
   original tag baseline, on failure as well as success.

Only after registry and consumer acceptance succeeds does the workflow create
each candidate package's GitHub Release from its generated changelog section
and package-version Git tag. This step is idempotent: a retry can create a
missing announcement even if npm already has that candidate version. Alpha and
beta GitHub Releases are marked as prereleases. The verified receipt also
includes unchanged packages; it must not be interpreted as a list of packages
newly published in that run.

Registry preflight is not publication proof. Post-publication checks require
the exact expected versions and tags; missing packages fail. Local packed acceptance and registry acceptance are separate evidence:
installing a registry package does not by itself prove type or browser behavior.

## Recover partial publication

Keep the same release commit and exact versions. Inspect the failed step; do
not bump versions again, unpublish successful packages, or move protected tags
to hide a partial release. Alpha retries preserve `latest` and `beta`; beta
retries preserve `latest` and `alpha`. Fix the prerequisite and retry the same
reviewed SHA.
If the original `latest-before.json` baseline is missing and any candidate version
already exists on npm, fresh baseline capture fails closed, even in a new manual
workflow run. Restore the baseline from that release SHA’s uploaded artifact
before retrying; an existing baseline is never overwritten.
Changesets skips already published npm versions and publishes the missing set.

The baseline filename remains `latest-before.json`. It records the channel,
release line, candidate set, protected `latest` and other-channel maps, and
same-channel tags for unchanged packages. Missing tags are `null`. Keep the
entire original file when recovering, not only its `latest` field.

A local retry retains its original `latest-before.json`. CI restores the
baseline using a key for the exact release commit and saves it before any npm
mutation. Retry the same commit so both the recorded candidates and tag baseline
remain available. If that cache is unavailable, recover the original baseline
from the failed run's uploaded evidence before retrying. Restore any incorrectly
changed tags to that baseline; a freshly captured baseline cannot prove what
the tags were before the failed attempt.
### First publication and the `latest` baseline

For future releases, capture an explicit first-publication `latest` expectation
before any npm mutation. If the package's complete registry metadata is absent
(an actual registry 404, not a timeout, authorization failure or invalid response),
record its exact reviewed candidate version as the permitted initial `latest`
value, alongside the observed missing tag. This decision belongs to the saved
baseline and must survive retries; it is not inferred after publication.

Do not apply this exception to an existing package whose metadata is present,
even if its `latest` tag is missing. Existing `latest`, the other prerelease
channel, and unchanged-package channel tags remain protected exactly as recorded.
Do not treat a first-publication exception as permission to promote later
prereleases to `latest`, and do not relax candidate or dependency verification.

In the alpha.0 publication, the new preset and provider-rust packages acquired
`latest` alongside `alpha`, and npm CLI attempts to remove `latest` returned
HTTP 400. A similar behavior was reported in
[npm/cli issue #8490](https://github.com/npm/cli/issues/8490). These are observed
registry behaviors, not a promise of permanent npm platform semantics.

The [alpha.0 recovery record](./releases/0.2.0-alpha.0.md) keeps the original
pre-publication baseline intact and records this first-publication deviation
separately. Never rewrite that old baseline to make an already-published run
appear clean; use an independently reviewed recovery receipt and exact registry
acceptance. The workflow's failure status remains part of the release history.

Check GitHub Releases separately after a failed run. A package may already be
published on npm while its GitHub Release is missing. Rerunning the same plan
rechecks registry acceptance and creates missing announcements without
republishing existing npm versions. Do not create a new version merely to
recreate an announcement.

## Stable and later toolchain work

The workflow supports reviewed alpha and beta candidates while preserving
`latest` and the other prerelease channel. The first stable `0.1.0`
requires a separate review of prerelease exit, the publication command, dist-tag
policy, and transition tests. Exiting Changesets prerelease mode alone does not
authorize publication through `latest`. Both prerelease publishing commands
reject stable versions.

Beta does not promise automatic Rust installation or broader framework support.
The managed `@vooya/preset` toolchain is tracked separately for `0.2` in
[#129](https://github.com/vooyajs/vooya/issues/129); it is not a beta release gate.
Keep source toolchain requirements and the current compatibility matrix in the
beta documentation.
