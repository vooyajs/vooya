# Working on Vooya

Read [CONTRIBUTING.md](CONTRIBUTING.md) before changing the repository. It is
the canonical contribution policy for people and agents. This file provides
code navigation and an execution guide; it does not replace that policy.

## Understand the boundary

Vooya connects bounded WASM capabilities to existing web applications. The
host framework owns the application shell; Vooya connects compilation, typed
bindings, component/store behavior, and lifecycle.

- Current authoring uses ordinary Rust `.rs` files and explicit Vooya macros.
  `.voo` is legacy fixture coverage, not the default path for new features.
- Rust is the implemented language provider. Keep implemented behavior,
  experimental integrations, and proposed providers distinct.
- `@vooya/build-core` currently forwards to `@vooya/provider-rust`; do not
  assume there is already a public, language-neutral provider registry.
- The preset prepares native build tools. It is not a compiler running in the
  browser. Native toolchains and deployed WASM have different requirements.

Check [project status](docs/project/status.md) and the
[compatibility matrix](docs/project/compatibility.md) before making support
claims. Use [RFC 0008](docs/rfcs/0008-layer-boundary-and-roadmap.md) for design
context; an RFC proposal is not evidence that a feature has shipped.

## Find the implementation

| Area | Start here |
| --- | --- |
| Rust source discovery, workspace, builds, schemas, declarations | `packages/provider-rust/source/` |
| Build compatibility entry | `packages/build-core/source/` |
| Code generation, ABI and style helpers | `packages/compiler/source/` |
| Bundler entry points | `packages/vite/`, `packages/rspack/`, `packages/webpack/` |
| Framework adapters | `packages/vue/`, `packages/react/`, `packages/solid/`, `packages/svelte/` |
| Rust runtime and authoring macros | `crates/`, `packages/core/rust/` |
| Packaged core and native toolchain preset | `packages/core/`, `packages/preset/` |
| Consumer fixtures and browser acceptance | `tests/`, `examples/` |
| Repository and release tooling | `scripts/source/`, `.github/workflows/` |

## Make a focused change

1. Inspect the working tree and preserve unrelated edits. Read the issue,
   affected implementation, and relevant tests before choosing the fix.
2. Follow the branch naming rules in CONTRIBUTING: `feat/`, `fix/`, `docs/`,
   `refactor/`, `test/`, or `chore/`, followed by a short description.
3. Edit implementation sources. Do not patch generated `dist/`, `lib/`,
   `.vooya/`, or `scripts/generated/` outputs to make a check pass.
4. Follow [code conventions](docs/contribute/code-conventions.md). Preserve
   strict types and boundary validation; do not weaken checks to hide failures.
5. Keep tests and documentation aligned with the changed behavior. Avoid
   unrelated formatting, dependency upgrades, or new abstractions.

## Verify the affected boundary

Use the setup prerequisites in CONTRIBUTING and install dependencies with
`npm ci`. Read the affected package's scripts and existing tests before running
checks. Start with the smallest meaningful check, then cover affected callers.

| Change | Starting checks |
| --- | --- |
| Documentation | `npm run verify:docs`; `npm run docs:build` for site changes |
| Rust provider / build pipeline | `npm run test:build-core`, plus the affected consumer fixture |
| Compiler helpers | `npm run test:compiler` |
| Vue / React adapters | `npm run test:vue` / `npm run test:react`, plus the affected typecheck |
| Other adapters / bundlers | The corresponding package and integration scripts in `package.json` |
| Native preset | `npm run test:preset`; consumer coverage when installation or resolution changes |
| Published package contents | `npm run pack:check`, plus the affected clean-consumer test |

- Build-dependent suites can share generated artifacts. Run them serially
  unless the suite explicitly supports parallel execution or uses isolated
  outputs. Independent reads and reviews may run concurrently.
- A passing typecheck or build does not establish browser behavior. Changes to
  mounting, updates, events, disposal, or rebuild recovery need the relevant
  runtime coverage.
- Use CONTRIBUTING and the CI workflows for the full merge gates. Report exact
  commands, results, and checks not run; do not describe CI as passed before it
  has finished on the relevant commit.

## Prepare the contribution

- Published source, API, and dependency changes need package-scoped changesets.
  Documentation-only and test-only changes do not. Follow the
  [release-line policy](docs/maintainers/release-lines.md).
- Do not hand-edit package versions, generated changelogs, or internal release
  dependency versions. Use the documented release workflow when requested.
- Before a public commit, check the configured Git author and committer. Use
  the contributor's intended public identity and preserve existing authorship.
- Keep PR descriptions short: the problem, resulting behavior, linked issue,
  and verification. Keep local agent transcripts and coordination notes out of
  the repository.
- Pushing, merging, and publishing are separate actions. Follow the scope
  authorized by the contributor or maintainer; do not assume a code-change
  request also authorizes a release.
