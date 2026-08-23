# Contributing

Vooya is an open-source alpha. Contributions are welcome, including bug
reports, compatibility evidence, documentation improvements, and proposals that
show a current direction is wrong.

## Before opening a change

1. Read the [project status](../project/status.md) and [compatibility matrix](../project/compatibility.md).
2. Check existing issues and pull requests.
3. Keep the change focused: a bug fix, a fixture, a documentation correction,
   or one clearly bounded design proposal.
4. Distinguish observed behavior from a future idea in the description.

## What makes a useful contribution

- A reproduction that runs from a clean consumer directory.
- A named toolchain, framework, bundler, and browser when reporting
  compatibility.
- A test or fixture that protects the behavior being changed.
- Documentation that explains the user-visible boundary, not internal session
  discussions.

## Design proposals

Use an RFC only for a user-visible contract or architectural decision. Start a
GitHub issue titled `RFC: <proposal>` so alternatives and acceptance criteria
can be discussed before a numbered document is added. Ordinary bugs and
implementation tasks should remain issues.

See the repository [contribution guide](https://github.com/vooyajs/vooya/blob/main/CONTRIBUTING.md)
for commands, licensing, and pull-request checks.

## Scope for the current alpha

The most useful contributions right now are source-authoring ergonomics,
clean-machine Rust diagnostics, Vite/Rspack/Webpack evidence, browser QA,
TypeScript declarations, and documentation. The old `.voo` experiment is not a
new feature target.
