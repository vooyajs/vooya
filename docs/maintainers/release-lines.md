# Release lines and the next feature batch

## Published 0.2 alpha checkpoint

[Release run 37315595525](https://github.com/vooyajs/vooya/actions/runs/37315595525)
passed the complete `verify:release` gate and published the eight-package
`0.2.0-alpha.0` set. It subsequently failed when registry propagation exceeded
the verification timeout; the workflow itself did not finish successfully.
See the [publication and recovery record](./releases/0.2.0-alpha.0.md) for the
original baseline, independently completed checks and recovery receipt, and
[the version graph](../project/next-release.md) for installation boundaries.
Octane remains private. Historical scope reviews and dry-run results below are
retained as planning evidence; their unpublished wording describes that review
point. The separate 0.1 maintenance plan is not published by this alpha run.
This checkpoint does not assert that the public documentation site was deployed.


## Historical scope review

This is the release-scope review for published commit
[`689182fd`](https://github.com/vooyajs/vooya/commit/689182fd2c32bac2809d0f5e795cc39cc8bcfd44),
the main-branch integration in
[PR #149](https://github.com/vooyajs/vooya/pull/149) (including the Rust provider
extraction from [PR #148](https://github.com/vooyajs/vooya/pull/148)), and the
isolated maintenance backports in
[PR #150](https://github.com/vooyajs/vooya/pull/150).

Both PRs are merged and their candidate CI checks passed. Neither merge
published npm packages or deployed the public documentation site. Subsequent
type-safety and test-tooling cleanup stays on main; the maintenance branch
retains the small behavior-fix scope below.

## Working release approach

We are trying this approach for the current pre-1.0 development cycle and will
review it after practicing the two lines. Use the 0.1 line to maintain its published behavior. Group new capabilities into
a bounded 0.2 feature batch. A minor release should deliver a coherent set of
capabilities, not meet a quota of features. Once its scope is frozen, new
features move to a later batch; bug fixes, tests, and documentation continue.

The published packages are still `0.1.0-beta.N`. “0.1 maintenance” does not mean
that stable `0.1.0` or `0.1.1` has been published or approved. Removing the
prerelease suffix requires its own acceptance and publisher support.
Packages remain independently versioned: the product's feature batch is not a
reason to bump every unchanged package to the same version.

## Maintenance backport candidates

The two reviewed changes have been backported to `release/0.1` in PR #150,
with regression tests and packed-consumer acceptance. They are **unpublished**;
the version preparation and publication gate remain separate. The branch
starts from the published commit and takes only the fixes and their tests,
plus shared guarded release tooling. Do not release main as a maintenance patch.

| Candidate | Package and minimal change | Required evidence |
| --- | --- | --- |
| React Store factory throws synchronously | `@vooya/react`: invoke the factory inside the Promise chain so `onError` handles synchronous throws as well as rejected Promises. Exclude the new `use client` directive and SSR packaging changes. | The published API reproduces the failure; synchronous and asynchronous errors reach `onError`, and cleanup still works. |
| Rust source root contains dot segments or scans dependencies | `@vooya/build-core`: normalize root prefixes in module selection and workspace schema matching; exclude `node_modules` and `.git` from discovery. Apply the fix to the old implementation location, retaining the old public exports. | `sourceRoot: "."` and dot-segment roots discover the intended modules and declarations; dependency directories are ignored; a clean Rust-file consumer builds. |

For example, the published module selector returns no files for
`selectRustRootModules(["rust/Counter.rs"], "rust/.")`; the normalized selector
returns the intended module. That defect exists independently of SSR or a new
bundler integration.

The `?raw` import and generated Store interface fixes are already published in
the package versions listed on [Project status](../project/status.md). They
must not be counted as new release work.

The following main-branch fixes stay with their 0.2 features:

- Preset download locks, Windows cache paths, and managed/system selection
  identity repair behavior introduced by the new managed toolchain.
- Rust watch fingerprints and edits during a build repair the new bundler watch
  strategy. Backporting those commits alone would bring in part of that strategy.
- Filtering Vite's new Rust-record map fixes the new map implementation. The
  published lookup already ignores records without a source group.
- Webpack/Rspack watch changes are coupled to Rust-file support. A separate
  failure reproduced on the published legacy path would need a smaller fix.

A Changeset marked `patch` describes a change relative to its development
branch. It does not by itself establish eligibility for the 0.1 maintenance line.

## 0.2 scope freeze

The theme is easier Rust toolchain setup and a more complete host integration.
These are the frozen feature boundaries for the first 0.2 alpha. Fixes, tests
and documentation can continue; additional capabilities require a later batch:

| Area | Included | Boundary at freeze |
| --- | --- | --- |
| Rust provider package | Existing Rust build implementation, compatibility facade, package/type identity and consumer tests | No public provider registry or new serialized artifact format |
| Optional managed Rust preset | Pinned tools, verified downloads, isolated cache, failure recovery, doctor and system-tool selection | One optional Rust preset; host SDK/linker prerequisites remain |
| SSR-safe islands | Vue lazy Store factories, React client entry, adapter hydration tests and the named Nuxt consumer | Browser-mounted WASM; no server-rendered Rust content; Next.js remains unverified |
| Webpack/Rspack Rust sources | Named Vue/React components, Stores, CSS, declarations and tested watch recovery | Experimental integrations, limited to the documented fixture matrix |
| Vite 8 and Vite+ | Packed Vue/React/Solid/Svelte dev/build, declarations and failed-build recovery | Pinned compatibility evidence; no blanket toolchain or SSR claim |

Octane is deferred as a private workspace experiment with an independent test.
It is excluded from public build/publication candidates and the release gate.
Restoring public status requires a first-release Changeset and acceptance.
Public packages may not reference private workspaces in `dependencies`,
`optionalDependencies` or `peerDependencies`. Development-only tooling does not
become an installed consumer dependency through `devDependencies`.

Go/TinyGo experiments, a multi-language provider protocol, multilingual presets,
new framework adapters, Rust server rendering, and state-preserving Rust HMR
are outside this batch. An experiment can continue separately without becoming
a release requirement.

## From development to alpha

1. **Scope review:** agree on the included capabilities, their public APIs, and
   explicit exclusions. Each must have an owner and a runnable acceptance path.
2. **Scope freeze:** stop adding capabilities to the batch. Fix regressions and
   complete documentation on a candidate commit.
3. **Internal acceptance:** run targeted local checks, then one consolidated CI
   round on the candidate. Verify packed consumers, browser lifecycle, clean
   installation, supported hosts, and failed-build recovery. Fix all blocking
   findings before alpha; passing compilation alone is insufficient.
4. **Alpha:** publish a reviewed `0.2.0-alpha.N` transition for the affected
   existing packages only after versioning and channel safeguards are rehearsed.
   New packages need an explicit first-version decision. Keep the 0.1 beta tags
   and `latest` unchanged.
5. **Beta and stable:** use feedback from real consumers to settle the API and
   migration notes before beta. Stable publication needs its own reviewed gate;
   a green CI run does not automatically promote an alpha.

Alpha remains a prerelease even when it has passed internal acceptance. This
project chooses to freeze the batch's scope before alpha; fixes continue after
that point. Version ordering follows [Semantic Versioning](https://semver.org/).

## Release tooling acceptance

The source candidate now makes the two lines explicit in `.changeset/line.json`:
`main` targets `0.2.0-alpha.N`; `release/0.1` targets `0.1.0-beta.N`.
The wrapper uses the official Changesets planner and applier, with a reviewed
numeric target, monotonic versions, and dependency propagation against the
final versions. Maintenance changesets must be patches. Existing historical
release fixtures retain their original behavior without a line configuration.

The current version plan excludes Octane and produces eight feature candidates
at `0.2.0-alpha.0`, and five maintenance candidates: React/Vite beta.3 and
build-core/Rspack/Webpack beta.1. Unchanged packages and historical changelog
sections remain intact; repeating versioning without a new entry changes
nothing. These are planned versions, not published artifacts.

The publishing path separates the candidate set from the complete dependency
graph. Only candidates receive the selected channel tag; unchanged dependencies
are verified at their exact versions. Alpha protects `latest` and `beta`, while
beta protects `latest` and `alpha`. Same-channel tags of unchanged packages are
also protected. Retry checks retain the original baseline and must not roll
newer channel tags back.

Release preparation and publication require separate manual workflow dispatches
with an exact reviewed branch-head SHA. Source pushes do not trigger version
PRs or publication. The publisher still runs the complete release gate and
registry consumer acceptance. See the [operating procedure](./releases.md).

The original audit found that switching only `pre.json` from beta to alpha
produced `@vooya/vite: 0.1.0-beta.2 → 0.1.0-alpha.3`, not `0.2.0-alpha.0`.
Do not bypass the wrapper or merge a generated version PR without reviewing the
numeric targets, dependencies, changelogs and candidate set. Stable publication
and prerelease exit remain outside the supported publisher.

Keep source changesets intact while preparing this policy; hiding a changeset
does not remove its implementation from a package tarball. Do not edit published
package versions or move registry tags to simulate a branch split.

## Work order and CI budget

First settle the two release lines and rehearse the tooling. Then prepare and
test the small 0.1 backports from the published baseline. Integrate the bounded
0.2 batch, complete internal acceptance, and review its documentation before
publishing alpha. Documentation correctness fixes can be prepared now; final
version availability must be checked against the actual candidate.

Keep intermediate edits local. Run the smallest relevant checks while fixing,
collect related changes and review findings, then push one reviewed batch.
Keep CI for the newest candidate; cancel obsolete runs when they still consume
runners. Do not rerun successful jobs without a changed input or unresolved
failure, and do not trigger bot reviews for every small edit.

## Documentation acceptance

The default quickstart must work with published packages. Unreleased examples
must name that status and point to a reproducible source or packed-consumer path.
Review the complete reader journey in both languages: prerequisites, first
working component, production build, types, errors, cleanup, API reference,
compatibility, and upgrade boundaries. Historical RFCs and benchmark reports
retain their original context.

Check links and rendered navigation, then compare the deployed site with the
accepted source. A documentation build is not deployment evidence. Release
notes and documentation must distinguish package availability, integration
test evidence, and supported behavior.
