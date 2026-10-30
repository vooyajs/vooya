# RFC 0012: Delivery contract for the 1.0 release line

## Status

Draft. This RFC proposes a scope and sequencing contract for the 1.0 release
line. It does not change the current support matrix, package versions, or
published behavior. It is derived from [Issue #227](https://github.com/vooyajs/vooya/issues/227)
and records a decision request for maintainers.

## Summary

Vooya has substantial implementation activity, but its public surface does not
yet answer three questions an adopter needs:

1. Which path is supported for a real project today?
2. How does a component author distribute that work to users?
3. When will that path be stable enough to depend on?

This RFC proposes a narrower 1.0 contract:

- **Source authoring is the 1.0 distribution model.** Precompiled consumption
  stays experimental until after 1.0.
- **Rust remains the only supported language.** Provider research is moved
  behind a `Post-1.0` boundary.
- **Vue and React are the 1.0 framework set.** Solid and Svelte remain
  experimental.
- **Vite 7/8 is the 1.0 bundler set.** Rspack and Webpack remain experimental.
- **The release gate is a clean-machine golden path**, not a source fixture.

The purpose is not to reduce ambition. It is to make the current ambition
legible, testable, and releasable.

## Context

The project is active. It has repeated alpha releases, a broad browser fixture
suite, and a documented product boundary. The concerns in this RFC are about
sequencing and public legibility, not effort.

As of 2026-10-30:

- The open issue set is dominated by post-beta provider research: #94, #168,
  #175, #176, #209, #211, #212, #213, #214, #215, and #220.
- Three of four open pull requests are stale, conflicting, or superseded:
  #171 is replaced by #222, #186 is conflicting, and #110 overlaps #176.
- Distribution is unresolved. #210 retired the dedicated precompiled Vue
  component-package builder. The current source path still requires Cargo, the
  WASM target, and `wasm-bindgen`; no supported zero-Rust consumer path exists.
- Versioning is difficult to explain: beta is the default, 0.2 alpha is
  opt-in, package versions differ, and prerelease ABI revisions can break.
- RFC 0008 names 0.2, 0.3, and 1.0 themes but has no dated milestones, owners,
  entry criteria, exit criteria, or release gates.
- No external component package validates the authoring and distribution path.

The project does not need another feature proposal. It needs a delivery
contract that states what will be supported, what will not, and how completion
is verified.

## Decision

### 1. 1.0 distribution model: source authoring

Vooya 1.0 should support source authoring only:

- an application installs `@vooya/vite` and a framework adapter;
- it writes or imports `.rs` Components and Stores;
- the application build compiles Rust to WASM;
- component authors distribute `.rs` sources, framework wrappers, CSS, and
  documentation under their own npm package or source registry;
- consumers need Cargo, the `wasm32-unknown-unknown` target, and a matching
  `wasm-bindgen` CLI, optionally prepared by `@vooya/preset`.

Precompiled consumption without a Rust toolchain remains experimental research
after 1.0. It does not become a 1.0 promise. This follows the direction already
taken in #210 and avoids maintaining two half-supported distribution paths.

Choosing source authoring has consequences:

- The quickstart must state the toolchain requirement before installation.
- The docs must not imply that a published Vooya component package works
  without Rust.
- A future precompiled path needs its own RFC, artifact compatibility policy,
  loader contract, and clean-consumer evidence.
- #176, #215, and #106 remain valid research, but they do not block 1.0.

If maintainers prefer a precompiled 1.0, this decision must be reversed
explicitly. In that case #176 and the artifact contract become 1.0 blockers,
and unrelated provider research must pause until a clean consumer works.

### 2. Supported 1.0 surface

| Layer | 1.0 scope | Remains experimental or post-1.0 |
| --- | --- | --- |
| Authoring | Rust `.rs` Components and Stores | Additional language providers |
| Frameworks | Vue 3 and React 19 | Solid, Svelte, Vue Vapor, Octane |
| Bundlers | Vite 7 and Vite 8 | Rspack, Webpack, Turbopack, Rollup, Vite+ |
| ABI | Owned ABI v1 with a published compatibility policy | Recursive types, borrowed values, arbitrary generics, TypedArray transport |
| Distribution | Source authoring with a host Rust toolchain | Precompiled component packages |
| Runtime | Client-mounted islands, full reload after Rust rebuilds | Slots, portals, SSR-rendered Rust DOM, state-preserving HMR |
| SSR | SSR-safe host containers and client mount for Vue/React | Next.js support, server-rendered Rust content |

This table is a scope decision, not a claim that experimental paths are
unmaintained. Experimental paths keep their current evidence and warnings.

### 3. Post-1.0 research boundary

Move the language-provider and artifact research to a `Post-1.0` milestone:

- #94 language-provider architecture
- #168 recursive cross-language components
- #175 shared portable interface design
- #176 provider-owned multi-asset loader
- #209, #211, #212, #213, #214, #215, #220 Go/Zig canaries and conformance

Accept a new provider canary only after #175, #176, and #212 meet their stated
exit criteria. Do not implement Go or Zig before the shared interface and
loader are accepted. Otherwise each canary defines its own temporary boundary
and the results cannot be compared.

The public support claim stays Rust-only until a second provider passes the
same conformance suite and receives an explicit release decision.

### 4. Milestones, owners, and definition of done

1.0 requires dated milestones. The relative sequence below is a proposal for
maintainers to adjust; the final RFC must contain actual dates and owners.

| Milestone | Proposed window | Required outcome |
| --- | --- | --- |
| Decision and backlog reset | T+2 weeks | Distribution decision recorded; stale PRs resolved; `Post-1.0` milestone created |
| `0.2.0` stable | T+6 weeks | 1.0 scope table accepted; clean Vue and React consumers pass on Vite 7/8; docs updated |
| `1.0.0-rc` | T+4 months | ABI compatibility policy published; golden path passes from a clean machine; no known release blocker |
| `1.0.0` | T+6 months | Release gate, registry consumer checks, migration notes, and support policy complete |

Each milestone must name:

- scope and non-goals;
- the release gate and the exact commands that prove it;
- an owner;
- a target date;
- the work allowed to slip if the date moves.

A monthly public status update should report shipped, slipped, next, and
blocking items. Roadmap updates belong in the repository, not in private
coordination notes.

### 5. Pull request backlog

The 1.0 contract cannot be reviewed on top of unresolved stale work:

- Rebase and merge #222 on top of #221. Its current `test:rust-bundlers`
  failure appears to be the watch-settling issue addressed by #221.
- Close #171 as superseded once #222 lands.
- Rebase and land #186, or close it and split the remaining design work.
- Fold #110 into #176 or close it. Do not maintain two competing artifact
  manifest designs.
- Adopt a decision rule: a pull request without a maintainer decision for 14
  days must be reviewed, closed, or explicitly scheduled.

### 6. Golden path release gate

The 1.0 release gate is a clean-machine path, not a source fixture:

1. install the documented packages on a clean project;
2. run development and mount a Component or Store in a browser;
3. edit Rust and observe a rebuild;
4. introduce a Rust error and recover without restarting the project;
5. run a production build;
6. interact with props and events in a real browser;
7. dispose and remount without leaks;
8. repeat for Vue and React on Vite 7 and Vite 8.

The quickstart in CI, packed-consumer tests, and registry-consumer tests must
exercise this path. A passing unit suite or source fixture does not substitute
for it.

### 7. Auditable claims

Every public claim in the README, documentation site, and project status must
link to one of:

- a named automated test;
- a recorded release or commit;
- a published package version and its consumer evidence.

When a path is retired, dependent claims must be removed or marked retired in
the same change. The #210 retirement is the model: the implementation, docs,
compatibility matrix, and roadmap were updated together.

Add or maintain a single known-limitations page covering distribution, SSR,
slots, HMR, ABI, framework coverage, and browser coverage.

## Non-goals

This RFC does not:

- add a language provider, WIT, Component Model runtime, browser IDE, or
  component package builder;
- promise a date for post-1.0 research;
- remove or deprecate existing experimental implementations;
- expand the published support matrix;
- change package versions or release automation.

It deliberately reduces the number of promises made by 1.0.

## Success criteria

Within six months of acceptance:

- `1.0.0-rc` or `1.0.0` is published with an ABI compatibility and support
  policy.
- The source-authoring distribution path works from a clean machine using only
  public documentation.
- No open pull request is older than 30 days without a maintainer decision.
- The `Post-1.0` provider backlog does not block the 1.0 gate.
- A monthly roadmap and status update is published.
- Stretch: at least one external component package is built from the public
  documentation without maintainer-private context.

## Open questions

1. Do maintainers accept source-only distribution for 1.0, or is precompiled
   consumption a 1.0 requirement?
2. Is the 1.0 framework set limited to Vue and React, with Solid and Svelte
   remaining experimental?
3. Is ABI v1 frozen at 1.0, or is a compatibility revision still allowed
   during the 1.0 release candidate period?
4. Which bundlers are inside the 1.0 gate? This RFC proposes Vite 7/8 only.
5. Who owns the monthly roadmap update and the `Post-1.0` milestone?
6. What is the support window for the 1.0 line?

## References

- [Issue #227](https://github.com/vooyajs/vooya/issues/227) — originating
  proposal and discussion.
- [RFC 0008](0008-layer-boundary-and-roadmap.md) — layer boundary and
  version-level roadmap.
- [Issue #16](https://github.com/vooyajs/vooya/issues/16) — 0.1 product
  boundary and beta gate.
- [PR #210](https://github.com/vooyajs/vooya/pull/210) — retirement of the
  dedicated precompiled Vue component-package builder.
- [Issue #129](https://github.com/vooyajs/vooya/issues/129) — managed
  toolchain and remaining clean-host acceptance.
- [Issue #176](https://github.com/vooyajs/vooya/issues/176) — provider-owned
  multi-asset loader research.
- [Issue #106](https://github.com/vooyajs/vooya/issues/106) — lazy isolated
  WASM artifacts for independent authored roots.
