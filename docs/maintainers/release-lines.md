# Release lines and the next feature batch

This is the release-scope review for published commit
[`689182fd`](https://github.com/vooyajs/vooya/commit/689182fd2c32bac2809d0f5e795cc39cc8bcfd44),
current source through [PR #147](https://github.com/vooyajs/vooya/pull/147), and
the separate Rust package extraction in
[PR #148](https://github.com/vooyajs/vooya/pull/148).

## Release policy

Use the 0.1 line to maintain its published behavior. Group new capabilities into
a bounded 0.2 feature batch. A minor release should deliver a coherent set of
capabilities, not meet a quota of features. Once its scope is frozen, new
features move to a later batch; bug fixes, tests, and documentation continue.

The published packages are still `0.1.0-beta.N`. “0.1 maintenance” does not mean
that stable `0.1.0` or `0.1.1` has been published or approved. Removing the
prerelease suffix requires its own acceptance and publisher support.
Packages remain independently versioned: the product's feature batch is not a
reason to bump every unchanged package to the same version.

## Maintenance backport candidates

Two changes are suitable **backport candidates**, not ready-to-publish binaries.
Start from the published commit and take only the fix and its regression test.
Do not release the current main branch as a patch or copy a whole feature PR.

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

## Proposed 0.2 scope freeze

The theme is easier Rust toolchain setup and a more complete host integration.
These are the proposed boundaries for the first 0.2 alpha:

| Area | Included | Boundary at freeze |
| --- | --- | --- |
| Rust provider package | Existing Rust build implementation, compatibility facade, package/type identity and consumer tests | No public provider registry or new serialized artifact format |
| Optional managed Rust preset | Pinned tools, verified downloads, isolated cache, failure recovery, doctor and system-tool selection | One optional Rust preset; host SDK/linker prerequisites remain |
| SSR-safe islands | Vue lazy Store factories, React client entry, adapter hydration tests and the named Nuxt consumer | Browser-mounted WASM; no server-rendered Rust content; Next.js remains unverified |
| Webpack/Rspack Rust sources | Named Vue/React components, Stores, CSS, declarations and tested watch recovery | Experimental integrations, limited to the documented fixture matrix |
| Octane and Vite+ | Native Octane adapter and the existing five-adapter Vite+ dev/build matrix | Experimental, pinned compatibility evidence; no blanket toolchain claim |

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

## Release tooling work required first

The policy above is not yet an automated release-line switch. Current tooling
has these constraints that must be resolved before publishing either line:

- `release:status` is read-only and currently includes all pending main-branch
  Changesets in the beta release plan. On the reviewed source, it assigns the preset and Octane `0.1.0-beta.0`
  and advances existing packages' beta counters, including SSR changes. A
  `minor` entry does **not** establish a 0.2 target in this prerelease state.
- `.changeset/pre.json` has one channel, the workflow and publisher require
  `main`, and beta validation accepts only `0.1.0-beta.N`. A proposed
  `release/0.1` maintenance branch cannot use the current publisher unchanged.
- Tag synchronization requires the entire public package set to match the
  selected channel and updates that set's channel tags. Separate the packages
  being tagged from the full dependency set being verified, so unchanged 0.1
  dependencies can remain in a 0.2 alpha consumer graph.
- Alpha publication currently records and checks `latest`, but does not preserve
  a baseline for `beta`. Before 0.2 alpha, add before/after and retry checks for
  the existing 0.1 beta tags. A 0.1 beta maintenance release must continue
  preserving `alpha`, including future 0.2 alpha tags.

Do not merge a generated version PR as a substitute for those decisions. The
next release-tooling change must rehearse both lines in temporary fixtures:
exact target versions, increasing version precedence, dependency closure,
changelog history, candidate-only publication, protected tags, retry behavior,
and repeat-version stability. Merely switching `beta` to `alpha` at the same
numeric version moves version precedence backwards. A temporary planning
rehearsal produced `@vooya/vite: 0.1.0-beta.2 → 0.1.0-alpha.3` when only the
channel was changed; it did not produce `0.2.0-alpha.0`.

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
