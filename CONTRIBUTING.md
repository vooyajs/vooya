# Contributing to Vooya

Thank you for helping make Rust-backed components easier to use in web
applications. Vooya is still a public alpha, so focused changes with clear
evidence are more useful than broad framework promises.

This document is the canonical contribution guide for the repository.

## Before you start

- Small documentation fixes can be submitted directly as a pull request.
- Bugs should use the bug report template and include a minimal reproduction.
- Features, public API changes, new syntax, and architecture changes should
  start with an issue. Large accepted designs can then become an RFC under
  `docs/rfcs/`.
- Check the current product boundary in
  [Issue #16](https://github.com/vooyajs/vooya/issues/16). Do not assume that a
  future idea is already supported.

If you want a newcomer-sized task, look for issues labeled
[`good first issue`](https://github.com/vooyajs/vooya/labels/good%20first%20issue)
or [`help wanted`](https://github.com/vooyajs/vooya/labels/help%20wanted).

## Development setup

You need:

- Node.js `^20.19.0` or `>=22.12.0`;
- npm;
- a stable Rust toolchain managed by [rustup](https://rustup.rs/);
- the `wasm32-unknown-unknown` target; and
- `wasm-bindgen-cli` `0.2.115` for the current alpha.

```sh
npm install
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.115 --locked
npm exec -- vooya doctor
```

Windows contributors using the MSVC Rust toolchain also need Visual Studio
Build Tools with the **Desktop development with C++** workload, MSVC C++ build
tools, and a Windows SDK.

## Repository rules

### TypeScript is the implementation source

The compiler and JavaScript tooling are authored in TypeScript under
`packages/*/source` (or the package's documented source directory). Package
builds emit executable JavaScript and declarations into `dist/`.

- Edit the TypeScript source, not generated `dist/` files.
- Do not commit generated package JavaScript as a second source tree.
- Published packages must contain JavaScript and accurate `.d.ts` declarations;
  consumers do not need TypeScript installed at runtime.

### Name bundler integrations by toolchain

Public bundler integration packages use the toolchain name, such as
`@vooya/vite` and `@vooya/rspack`. Future integrations should follow
`@vooya/<toolchain>` rather than expose internal implementation details in the
package name. Plugin, loader, adapter, and compiler mechanisms belong inside
the package API and architecture; they are not package-name suffixes.

A new bundler package must state its experimental compatibility boundary and
include an automated packed-consumer test for every toolchain version it
claims to support.

### Naming conventions

Use the convention of the language or public ecosystem instead of applying one
spelling style to every layer:

| Surface | Convention | Example |
| --- | --- | --- |
| TypeScript source files | `kebab-case` | `build-scheduler.ts` |
| TypeScript variables/functions | `camelCase` | `resolveToolchain()` |
| TypeScript types/classes/interfaces | `PascalCase` | `BuildApplicationOptions` |
| TypeScript true global constants | `SCREAMING_SNAKE_CASE` | `VOO_ABI_VERSION` |
| Rust files/modules/functions/variables | `snake_case` | `rust_module_graph.rs` |
| Rust structs/enums/traits | `PascalCase` | `StoreState` |
| Rust constants | `SCREAMING_SNAKE_CASE` | `MAX_ITEMS` |
| npm packages | scoped `kebab-case` | `@vooya/build-core` |
| Cargo packages | `kebab-case` | `vooya-macros` |
| Vooya component names | `PascalCase` | `Counter` |
| Host-facing props/events | `camelCase` | `onCouponNotice` |
| JavaScript tests | module name + `.test.js` | `workspace.test.js` |

Rust macros and attributes follow Rust's normal spelling: role attributes are
lowercase (`#[voo::component]`) while derive names are `PascalCase`
(`#[derive(FromJs)]`). Do not rename existing files only to make casing
uniform; apply this rule to new files and when a file is already being moved.

### Keep claims evidence-based

- Distinguish current behavior, experimental behavior, and future plans.
- Do not claim that Rust or WASM is universally faster.
- Performance changes need a reproducible browser workload and comparison.
- A successful typecheck is not proof that a `.voo` component mounts, updates,
  emits events, disposes, and recovers after a failed Rust build.

### Keep private coordination out of the repository

Do not commit local work logs, tool transcripts, volunteer evaluations, private
contact details, or unpublished commitments. Mature technical decisions belong
in public issues, RFCs, tests, or user-facing documentation.

## Testing

These are merge expectations, not a barrier to opening a draft for early
feedback. Run the smallest relevant checks while developing, state any known
gaps, and broaden verification in proportion to the affected surface before
merge.

| Change area | Typical checks |
| --- | --- |
| Documentation | `npm run verify:docs` |
| Compiler or `.voo` syntax | `npm run test:compiler` and `npm run format:voo:check` |
| Vite or shared build pipeline | `npm run test:voo`, plus the affected typecheck or compatibility fixture |
| Vue or React adapter | The affected package test and application typecheck |
| Rspack or Webpack | `npm run test:rspack` or `npm run test:webpack` |
| Packaging or cross-package behavior | `npm run pack:check` and the affected clean-consumer test |

Other common commands include:

```sh
npm run test:compiler
npm run test:voo
npm run test:react
npm run typecheck
npm run typecheck:react
npm run verify:docs
npm run pack:check
```

The complete release gate is:

```sh
npm run verify:ci
```

Rust/WASM builds can share generated artifacts, so run build-dependent suites
serially unless a test explicitly documents that parallel execution is safe.

## Pull requests

Keep each pull request focused and reviewable:

1. explain the user problem and the chosen boundary;
2. link the issue for non-trivial behavior or public API changes;
3. add or update tests for behavior changes;
4. update documentation when the user workflow changes;
5. list the exact verification you ran and call out checks you could not run;
   and
6. avoid unrelated formatting or generated-file churn.

Use whatever development tools help you contribute effectively. Pull requests
are evaluated on their scope, evidence, maintainability, and value to the
project rather than on how their first draft was produced.

Draft pull requests are welcome when early feedback would help. Opening a pull
request starts a review; it does not guarantee that the change will be merged.
Maintainers may request a smaller scope, a clearer reproduction, additional
tests, or an issue/RFC, and may decline changes that do not fit the current
project direction or maintenance capacity. The project is responsible for
applying its full review and CI requirements before merge.

Vooya uses Semifold for coordinated package releases. Do not edit package
versions, changelogs, or exact internal dependency versions by hand. A
maintainer will confirm whether a user-visible change needs a Semifold entry;
when requested, create it with:

```sh
npm run changeset
```

## Reporting security issues

Please follow [SECURITY.md](SECURITY.md) and avoid publishing exploit details in
a normal issue.

By participating, you agree to follow the repository's
[Code of Conduct](CODE_OF_CONDUCT.md).