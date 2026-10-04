# Code and test conventions

Use TypeScript for package implementations and substantial repository tooling,
with strict type checking. Publish ordinary JavaScript and generated declarations
so consumers do not need a TypeScript runner. Keep Rust implementation and tests
in the Rust toolchain.

## Types at boundaries

Validate external JSON and process output before using it. Start with `unknown`,
narrow the fields the caller needs, and preserve runtime checks for malformed
input. A cast or a hand-maintained declaration is not evidence that an external
value has the expected shape.

Keep implementation signatures and public declarations connected. For example,
the managed Rust preset is authored in TypeScript and builds to its existing
`lib` entry points; its declarations are generated from the same source. Do not
edit generated files or add whole-file `@ts-nocheck` to make a migration pass.

## Tests and executable scripts

Test the boundary being promised to users:

- Package tests import built JavaScript so they exercise the published module
  shape. TypeScript tests are welcome when their types are actually checked;
  changing an extension alone adds no type protection.
- Declaration tests compile realistic consumer code with strict TypeScript
  checks. JavaScript test runners can and do test generated TypeScript APIs.
- Consumer and release tests may remain directly executable `.mjs` files. Keep
  installation, fixture paths, subprocesses and cleanup working on the Node
  versions in the compatibility matrix.
- Scripts that run before `npm ci`, such as the lockfile registry check, must
  work without dependencies or a compilation step.
- Shared JavaScript helpers use JSDoc and `checkJs` with `noEmit`. Run
  `npm run typecheck:test-helpers` after building the packages and scripts they
  import. This check covers the shared helpers, not every integration runner.

Share a helper when several tests need the same behavior and lifecycle. Keep
test-specific assertions local. Avoid a large test framework that obscures how
a consumer installs, builds, runs and disposes a Vooya capability.

## Formatting and validation

Follow the surrounding file's formatting, use clear names, and split dense
control flow when it makes failure handling easier to review. Keep formatting
changes close to the affected code rather than reformatting unrelated files.

Run the checks affected by the change locally, then submit one coherent PR.
Batch related fixes before pushing so CI can validate a reviewed candidate.
Reuse successful checks on an unchanged commit; rerun after relevant changes
or when a failed check needs investigation. See the
[release procedure](../maintainers/releases.md) for the complete release gate.

## Repository language statistics

The repository's `.gitattributes` excludes standalone test directories,
fixtures and `*.test.*` / `*.spec.*` files from language statistics. This policy
applies to every language, including Rust and TypeScript. Embedded tests in an
implementation file still count with that file. Implementation, CLI and build
tooling files remain eligible for GitHub's normal language detection.

Use `linguist-detectable=false` for these exclusions. Handwritten tests are not
generated code or vendored dependencies, and their review diffs should stay
visible. GitHub computes its language bar from eligible file bytes, not from
architectural importance or type safety; it updates after the default branch
is analyzed. See [Linguist's statistics documentation](https://github.com/github-linguist/linguist/blob/main/docs/how-linguist-works.md)
and [attribute overrides](https://github.com/github-linguist/linguist/blob/main/docs/overrides.md).
