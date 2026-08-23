# Project

Vooya is a public alpha focused on validating the WASM integration-layer
boundary. This section separates shipped evidence from planned work so that a
passing fixture is not mistaken for a broad support promise.

## Project pages

- [Status](./status): what the current alpha can do and where it is limited.
- [Compatibility matrix](./compatibility): framework, bundler, browser, and
  toolchain evidence.
- [Roadmap](../rfcs/0008-layer-boundary-and-roadmap): version-level direction
  from the integration foundation toward a stable layer contract.
- [Releases](../maintainers/releases): coordinated package release rules.
- [Benchmarks](../benchmarks/data-grid): workload-specific measurements and
  their limits.

## How to read support claims

“Verified” means a named repository command passed against a named fixture.
“Experimental” means the path is useful for investigation but still has a
known boundary or incomplete matrix. “Not supported” means the project does not
currently make a compatibility claim for that path.
