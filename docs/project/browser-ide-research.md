# Browser IDE Research Boundary

This record scopes the experimental work proposed in [Issue #181](https://github.com/vooyajs/vooya/issues/181).
It does not add a browser IDE, browser Rust compilation, remote compilation, or
offline language-environment support to Vooya.

## Three Distinct Experiences

These paths have different trust, availability, and toolchain requirements. A
demo must name the path it uses rather than presenting all three as "editable
Rust in the browser."

| Experience | What users can edit | Where compilation runs | What it proves |
| --- | --- | --- | --- |
| Precompiled playground | Host code, props and inputs around shipped WASM | Nowhere | Browser embedding and component lifecycle only |
| Remote compilation playground | Host code and source sent to a named service | Controlled remote builder | Online build service behavior, not offline source compilation |
| Browser compilation environment | Source, dependencies and supported configuration | Browser-executable compiler/runtime | The named compiler/dependency subset runs after its environment is cached |

The first path may be useful documentation work before a browser compiler
exists. It must not show an editable Rust editor unless the edits are clearly
non-executable examples. A remote compiler must state its network, retention,
credential and sandbox policy. A browser compiler requires more evidence than a
small standalone Rust program: Vooya procedural macros, build scripts,
dependencies, linking, `wasm-bindgen` output and browser loading all need a
named experiment.

## First Experiment Contract

Start with one real, bounded Rust Component or Store already covered by a
repository or Vooya Lab case. Record exact versions of the browser, Node-free
environment, compiler/runtime, standard library, dependencies and generated
assets. The experiment must not replace the case with an arithmetic-only WASM
function.

The host owns routing, documentation state, account data, file-system access,
network authority, persistence and user approval. The evaluated capability owns
only its declared source/project snapshot, build result, diagnostics, preview
assets and lifecycle. Do not give generated code implicit access to host
credentials, arbitrary filesystem handles, network APIs or native permissions.

Workers can keep a compiler responsive, but do not by themselves isolate an
untrusted preview from the documentation page. Preview isolation, resource
limits, cancellation, network policy and persistence each need an explicit
design before untrusted code is accepted.

## Environment Inventory

Each named browser environment needs a versioned inventory containing:

- compiler/provider and runtime versions;
- standard-library, package and build-script support boundaries;
- JS, WASM, CSS, worker, data and source-map assets with cache identities;
- required browser features, headers and deployment constraints;
- source/dependency size limits, memory/time limits and cancellation behavior;
- offline availability and a documented cache invalidation/removal policy.

`@vooya/preset` is a native host-tool installer. It cannot execute its native
tools inside the browser and is not evidence for any browser environment.
Likewise, a cached compiler binary without its dependencies, runtime assets and
standard library is not offline support.

## Evidence Gates

Before describing an environment as browser compilation, record all of the
following for the named example:

1. edit source, compile, load generated bindings, mount, update, emit, dispose
   and remount in a browser;
2. report a source-level compiler error, correct it and rebuild without a full
   page restart;
3. cancel or stop a pending build/preview and prove late output cannot update a
   newer run;
4. download a fresh environment, disconnect the network, reload, edit, rebuild
   and run while reporting every missing cached asset clearly;
5. measure cold download, warm startup, rebuild time, peak memory and repeated
   stop/dispose behavior against a named baseline;
6. export the example and continue it through the documented local Vooya path.

Passing one browser/compiler combination does not establish a generic IDE,
multi-language support, offline execution for arbitrary packages or
cross-language component composition. Findings about artifacts, loaders,
diagnostics, runtime ownership or cache identity belong in the owning issues
under [language-provider research](./language-provider-research.md) and should
gain automated evidence before expanding a public claim.

## Deferred Work

- A reusable editor toolkit or full desktop IDE replacement.
- Remote compilation as a substitute for offline support.
- Untrusted code execution before a sandbox and resource model exist.
- General project collaboration, account storage or agent authority.
- A second language environment before the first one has a documented
  compiler/runtime/asset boundary.

Vooya Lab owns interactive case presentation and experimental UI. This
repository owns any compiler, ABI, runtime, adapter, asset-loading or diagnostic
contract a case proves missing; see [RFC 0011](../rfcs/0011-lab-self-hosting-program.md).
