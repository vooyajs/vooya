# Project

Vooya is a public beta focused on validating the WASM integration-layer
boundary. This section separates shipped evidence from planned work so that a
passing fixture is not mistaken for a broad support promise.

## Project pages

- [Status](./status.md): what the current beta can do and where it is limited.
- [Compatibility matrix](./compatibility.md): framework, bundler, browser, and
  toolchain evidence.
- [Lab self-hosting program](../rfcs/0011-lab-self-hosting-program.md): the
  ongoing evidence and ownership loop between this repository and Vooya Lab.
- [Turbopack research](./turbopack-research.md): loader API evidence and open
  integration questions for a future Next.js source integration.
- [Language provider research](./language-provider-research.md): the post-beta
  provider and normalized artifact boundary; Rust remains the only beta source
  language.
- [Roadmap](../rfcs/0008-layer-boundary-and-roadmap.md): version-level direction
  from the integration foundation toward a stable layer contract.
- [Releases](../maintainers/releases.md): independent package versions and release acceptance.
- [Benchmarks](../benchmarks/data-grid.md): workload-specific measurements and
  their limits.

## How to read support claims

“Verified” means a named repository command passed against a named fixture.
“Experimental” means the path is useful for investigation but still has a
known boundary or incomplete matrix. “Not supported” means the project does not
currently make a compatibility claim for that path.

## Project family

- [Vooya FS](https://github.com/vooyajs/fs): native Node.js batch filesystem
  operations, continuing Rush-FS under the Vooya boundary model.
- [Vooya Lab](https://vooyajs.github.io/vooya-lab/): runnable experiments and
  evidence for Rust, WASM, ABI, memory, and host-runtime decisions. New cases
  follow the Lab's [case specification standard](https://github.com/vooyajs/vooya-lab/blob/main/docs/case-spec.md);
  findings that change compiler, ABI, runtime, adapters, or tooling are fixed
  here rather than kept as Lab-only workarounds.

These projects share principles, not support matrices. Browser compatibility in
this repository does not imply Node filesystem compatibility, or vice versa.

- [Next release: unpublished features](./next-release.md)
- [Release lines and maintenance policy](../maintainers/release-lines.md)
- [SSR and 0.2 provider roadmap](./ssr-roadmap.md)
