# RFC 0005: Island events and lifecycle diagnostics

## Status

Implemented for the Rust-file source-authoring path used by the Vite adapter.
The earlier `.voo` implementation was an exploratory intermediate and is not
the current authoring contract.

## Component events

An event declared in a component's `events:` block is emitted from Rust through
the generated `context.events.<event>(...)` method. The generated method
dispatches a `CustomEvent` on that component's framework-provided host element:

- its name is `vooya-<event>`;
- `bubbles` is `false`;
- zero parameters use `undefined` as `detail`;
- one parameter uses that primitive value as `detail`;
- multiple parameters use an array in declaration order as `detail`.

The Vue adapter listens on the same host and forwards the values to Vue `emit`.
The React adapter listens on the same host and forwards the values to the
corresponding `onXxx` callback. These events are an island-to-adapter boundary;
they are not a DOM bubbling channel for ancestors or other islands.

Adapters install component-event listeners before calling `mount`. They remove
them before disposal. If `mount` throws, both adapters remove those listeners
immediately.

## Failed mount cleanup

Generated component context contains a `cleanup` scope for one mount attempt.
Component code can call `context.cleanup.defer(...)` to register a callback for
a resource created before `mount` returns. If mount returns an error, the
generated binding runs these callbacks in reverse registration order and removes
host children appended during that mount attempt. On success it disarms the
scope and the returned component handle owns its normal disposal.

This does not track or automatically undo arbitrary direct `web_sys` side
effects that were not registered in the cleanup scope. Component authors remain
responsible for such resources.

## Development lifecycle diagnostics

In development builds, adapters dispatch host-local, non-bubbling events:

- `vooya:mount`
- `vooya:update`
- `vooya:dispose`
- `vooya:error` for failed load, mount, update, or disposal

Each event detail has only `component`, `abiVersion`, `phase`, and non-negative
`duration`. Error diagnostics additionally contain `error` with truncated
`name` and `message`. They do not include props, component-event payloads,
stacks, or the original `Error` object. Production builds do not emit these
diagnostics.

Diagnostics are observations for development tooling; the component runtime
does not depend on a listener or a DevTools package.

## Compatibility

This RFC does not change the Rust-file syntax, generated WASM export names, ABI
version, or the Vue and React adapter public APIs.
