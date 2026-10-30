# Rust conversion schema v2

Schema v2 closes the ABI type identity gaps in
[Issue #119](https://github.com/vooyajs/vooya/issues/119). It describes the
JavaScript values consumed or produced by a conversion, not Rust memory layout.
The runtime ABI remains version 1.

## Compile-time resolution

`FromJs` and `ToJs` expose a hidden `__VOO_SCHEMA` associated constant. Built-in
scalars and containers describe their conversion. Derives return a named
reference with `concat!(module_path!(), "::", stringify!(Type))` and the conversion
direction. Role and derive macros ask rustc for `<ActualType as FromJs/ToJs>`
metadata instead of trying to resolve Rust syntax themselves. Rust therefore
handles imports, type aliases and module path overrides.

Derived named shapes live in separate records. References stop at identity,
so a recursive Rust type does not cause infinite const evaluation. The provider
can detect a recursive snapshot at its field's source position.

A const encoder combines literal record data with resolved descriptors into a
fixed byte array in `__voo_schema`. It measures and writes with the same JSON
encoder, escapes control characters, and preserves UTF-8. The provider reads
static WASM custom sections without instantiating WASM or running authored code.

## Wire format

Every record declares `version: 2`. Authored type strings and source locations
remain available for diagnostics. ABI parameters and struct fields add `abi`;
stores add `snapshotAbi`. Named type records add `identity` and retain `direction`.
References look like:

```json
{"kind":"named","identity":"vooya_app::models::Selection","direction":"to"}
```

Descriptors cover scalar, named, option, vector, string-key map, tuple, opaque,
and unsupported values. Containers contain descriptors, not authored Rust type
strings. Only ABI-v1 scalars and tuples of length two through four are accepted.
The reader rejects malformed descriptors, excessive container nesting, duplicate
identity/direction pairs, and unknown schema versions.

Identity is scoped to the compiled artifact and its crate graph. It is not a
persistent registry key, a TS display name, or a promise that renaming modules
preserves identity. Multiple versions of a dependency with the same crate/module
path are not disambiguated by this format: conflicting records fail rather than
silently selecting one. Expanding cross-crate identity requires a future contract.

The provider follows exact identity/direction edges and emits reachable records
only. Missing explicit metadata is an error. It never tries a same-name fallback
for v2. Two conversion directions share a declaration only when they belong to the
same identity and their reachable shapes agree. Different identities remain
separate even if structurally equal. TypeScript names are allocated deterministically
from short names, module prefixes, direction suffixes and collision suffixes.
No process-wide graph handles or caches escape an artifact generation.

## Manual conversions and migration

The default associated constant is `Opaque`. Existing manual implementations
continue to compile and generate `unknown` at the conversion boundary. A `FromJs`
derive cannot describe a manual `ToJs` implementation: the latter may emit a
string while the former consumes an object. Hidden metadata is implementation
machinery, not a new stable manual-schema authoring API.

Adding an associated constant makes `ToJs` non-dyn-compatible. This is an explicit
0.2 alpha API change. Callers using `dyn ToJs` must move to a generic `T: ToJs`
boundary or their own object-safe conversion interface. `FromJs` already requires
`Sized`. Conversion function bodies and runtime transport do not change.

Update the packaged Rust sources (`@vooya/core`) and reader
(`@vooya/provider-rust`) together, then rebuild artifacts. The new reader accepts
v1 with its existing conventional-source-layout behavior. Old readers reject v2.
This is a metadata version change, not a new runtime ABI or a generic Rust FFI.
Component role association remains the existing same-file contract. Generic
public types, recursive public values, payload enums, borrowed snapshots, and
zero-copy transport remain outside the supported boundary.

## Verification

`npm run test:rust-type-identity` compiles packaged Rust through the public build
API and checks four framework declarations for inline modules, import/type
aliases, path overrides, nested containers, enums, same-shaped distinct types,
and differing input/output conversions. The Vue browser fixture uses scalar and
container aliases to check runtime prop categories and event transport.
`npm run test:rust-snapshot-diagnostics` covers opaque manual output, recursive and
borrowed snapshot diagnostics, source locations and preservation of prior output.
Provider tests cover malformed metadata, missing references, deterministic names,
and v1 compatibility.
