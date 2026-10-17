# Portable Interface Design

This is the design record for [Issue #175](https://github.com/vooyajs/vooya/issues/175).
It defines an internal contract to evaluate before adding another source
language. It does not change Rust ABI v1, publish a provider SDK, or adopt the
WebAssembly Component Model runtime.

## Two Capabilities

Every exported interface must declare one of these capabilities:

| Capability | Consumer | Allowed surface |
| --- | --- | --- |
| JS-facing | A selected framework adapter in one browser application | Existing DOM handles, `JsValue` glue, framework callback conventions, and provider-specific loaders |
| Portable | Another provider or a framework-neutral artifact consumer | Owned data values, declared actions, snapshots, notifications, failures, and explicit resources only |

A JS-facing interface is not automatically portable. A provider must reject an
attempt to compose a JS-facing interface through a portable boundary rather than
coercing host objects or callbacks into an unspecified representation.

## Canonical Type Model

The portable contract uses one source-owned type graph. A provider either
generates it from source declarations or consumes a supplied contract; users do
not hand-maintain parallel Rust, TypeScript, WIT, and Go declarations.

| Portable type | JavaScript-facing representation | Portable rule |
| --- | --- | --- |
| `s8`, `u8`, `s16`, `u16`, `s32`, `u32`, `float32`, `float64` | `number` | Preserve integer width and range validation in the contract even though JavaScript uses one number type |
| `s64`, `u64`, `s128`, `u128` | `bigint` | Never silently narrow through `number` |
| `bool`, `string` | `boolean`, `string` | Owned values only |
| `option<T>` | `T \| null` | `null` is the portable absence representation |
| `list<T>` | `T[]` | Each element must be portable |
| `tuple<T...>` | fixed tuple | Arity and member order are part of the contract |
| `record` | object/interface | Field names, optionality, and types are checked recursively |
| `map<string, T>` | `Record<string, T>` | String keys only |
| unit enum | `{ type: "Variant" }` union | Payload enums are not in the first portable slice |
| result | success value or declared failure | The error contract must be explicit; arbitrary thrown host values are not portable |
| resource | opaque owned handle | Creation, methods, disposal, and ownership transfer must be declared explicitly |

Borrowed references, closures, arbitrary JS objects, DOM nodes, functions,
recursive types, generic public types, non-string-key maps, zero-copy typed
arrays, and unbounded provider runtime state are not portable in this slice.
They may remain JS-facing implementation details when the selected provider
owns their lifecycle.

## Interface Shape

An internal contract has named interfaces, type definitions, operations, and
resources. Operations identify their inputs, result, failure mode, and whether
they are JS-facing or portable. Store snapshot subscriptions and domain
notifications are distinct operations because their ordering and ownership are
different.

```text
interface counter-store portable
  type CounterSnapshot = record { count: u32, label: string }
  action add(amount: u32) -> result<void, action-error>
  snapshot get() -> CounterSnapshot
  subscribe(listener: snapshot-change) -> resource subscription
  dispose() -> void
```

The existing Rust Store ABI can be mapped into this shape only after action
results and typed Store notifications have their own contracts. Those are
tracked by [Issue #152](https://github.com/vooyajs/vooya/issues/152) and
[Issue #153](https://github.com/vooyajs/vooya/issues/153); this record does not
invent their wire semantics.

## Compatibility Examples

Compatible portable producer and consumer:

```text
producer: record { count: u32, label: string }
consumer: record { count: u32, label: string }
result: compatible
```

Incompatible producer and consumer with a field-path diagnostic:

```text
producer: record { count: u64, label: string }
consumer: record { count: u32, label: string }
result: $.count: expected u32, received u64; integer widths are not widened
```

Rejected JS-facing composition:

```text
interface canvas-host js-facing
  mount(element: DOMElement) -> handle

portable composition: rejected at canvas-host.mount.element:
DOMElement is JS-facing and has no portable representation
```

## Artifact Verification

An artifact advertises a contract digest, its capability, and every asset that
its provider loader needs. Generated TypeScript bindings are checked against the
same contract graph, while a provider checks its generated artifact exports and
runtime metadata against the digest before a consumer mounts it. A mismatch is a
load failure, not a best-effort conversion.

The loader and asset collection are not defined here. They are the internal
multi-asset prototype in [Issue #176](https://github.com/vooyajs/vooya/issues/176).
That prototype must establish asset, watch, cache, retry, and runtime-lifetime
semantics before this contract is serialized into a consumer artifact.

## WIT Decision Gate

WIT is a candidate target for portable interfaces, not the current source of
truth. The next design review compares:

1. authoring WIT directly and generating provider interfaces from it; and
2. mapping this small internal type model to WIT while retaining provider-owned
   source/schema generation.

Choose direct WIT only if it can express the required ownership, result, and
resource semantics without duplicating source declarations. Choose the mapping
only if contract generation remains deterministic and the mapping can diagnose
lossy fields precisely. Neither choice adopts a Component Model runtime; browser
delivery, loader behavior, and lifecycle evidence remain separate gates.

## Next Evidence

Before exposing any public provider interface, verify this model with the
provider-owned multi-asset loader spike, then the bounded Go Store spike in
[Issue #177](https://github.com/vooyajs/vooya/issues/177). AssemblyScript and
Emscripten remain complementary canaries. Passing one canary is experimental
evidence only and does not establish cross-language component composition or a
new supported authoring language.
