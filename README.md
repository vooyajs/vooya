# Vooya

**Write frontend components in Rust. Use them from Vue and React.**

Vooya is an experimental Rust-to-WASM component compiler for JavaScript
applications. A Vooya component owns an isolated DOM subtree, while the host
framework keeps control of the surrounding application, routing, and state.

```vue
<script setup lang="ts">
import Counter from "./Counter.voo";
</script>

<template>
  <Counter :initial="1" @change="value => console.log(value)" />
</template>
```

The implementation, public props, events, and scoped styles live in one `.voo`
component file. Vooya compiles its Rust code to WASM and generates the framework
adapter and TypeScript declarations automatically.

## Why Vooya

Rust already has excellent tools for data processing, parsers, editors,
graphics, simulation, and other demanding workloads. Vooya is an attempt to
bring that code all the way to the component boundary without asking teams to
replace their existing frontend framework.

The intended use cases are isolated, computation-heavy or high-update-rate
components such as:

- data grids and large interactive lists;
- editors, timelines, and visualization controls;
- Canvas, WebGL, and application-specific rendering surfaces;
- components backed by an existing Rust library.

Vooya does not assume that WASM makes ordinary DOM work faster. Crossing the
JavaScript/WASM boundary and manipulating the DOM both have costs. Early
versions may lose to a mature JavaScript implementation in some workloads. The
project is exploring the larger design space: typed component contracts,
shared Rust logic, generated framework bridges, and rendering strategies that
can improve without changing application code.

## Component Model

The host framework owns the mount element and its position in the application.
Vooya owns every node below it.

```text
Vue / React props -> generated adapter -> WASM component -> owned DOM subtree
Vue / React events <- generated adapter <- component events
unmount            -> dispose           -> release state and listeners
```

This boundary allows a Vooya component to behave like a normal Vue or React
component while keeping its state, update logic, and rendering implementation
in Rust.

## `.voo` Components

The current compiler accepts a component contract, a Rust module, and an
optional style block:

```voo
<component name="Counter">
props:
  initial: i32

events:
  change(value: i32)
</component>

<rust>
use wasm_bindgen::JsValue;

use crate::{EventListener, View, ViewElement};

pub struct Component {
    root: ViewElement,
    _click: EventListener,
}

impl Component {
    pub fn update_initial(&self, value: i32) {
        self.root.set_text(&format!("Count: {value}"));
    }

    pub fn dispose(&mut self) {
        self.root.remove();
    }
}

pub fn mount(context: Context) -> Result<Component, JsValue> {
    let host = context.host;
    let initial = context.props.initial;
    let events = context.events;
    let view = View::from_host(&host)?;
    let root = view
        .element("button")?
        .class("counter")
        .text(&format!("Count: {initial}"));
    let click = root.on("click", move |_event| {
        let _ = events.change(initial + 1);
    })?;
    root.mount(&host)?;
    Ok(Component { root, _click: click })
}
</rust>

<style scoped>
.counter {
    display: flex;
    gap: 8px;
    align-items: center;
}
</style>
```

The compiler generates the component's typed `Context`, `Props`, and `Events`,
then turns `mount`, `update_<prop>`, and `dispose` into the public WASM ABI.
Authors do not write `wasm_bindgen` exports, `CustomEvent` plumbing, WASM
initialization, Vue/React adapter factories, TypeScript declarations, or CSS
scope attributes.

`vooya-core` provides an initial `View` and `ViewElement` API for structured DOM
creation plus an `EventListener` that unregisters its callback when dropped.
`ViewElement::as_element()` remains available when a component needs a browser
API that the small Vooya layer does not expose yet. This is a deliberately small
foundation, not a template language or virtual DOM.

## Current Status

Vooya is currently a published alpha and an architecture-validation prototype,
not a stable compiler.

The repository now has:

- Rust source compiled directly from `<rust>` blocks to application-level WASM;
- generated mount, prop-update, dispose, and ABI-version bindings;
- contract-generated Vue and React lifecycle adapters;
- per-component `.d.voo.ts` declarations for props and events;
- Rust diagnostics mapped back to original `.voo` line numbers;
- PostCSS-based scoped styles shared by Vue and React;
- structured Rust DOM creation and owned browser event listeners;
- application-isolated Cargo crates, build caches, and WASM output;
- an npm-tarball portability test that builds `.voo` in a temporary project
  outside the Vooya checkout;
- debounced development rebuilds that survive Rust errors, coalesce rapid
  saves, and reload only after a successful WASM build;
- structured Cargo dependency configuration, application-relative path crates,
  and opt-in `web-sys` browser features;
- warm Cargo builds that preserve generated-file timestamps when unchanged;
- browser E2E coverage for Counter, TaskList, and DataGrid components;
- an honest 100,000-row benchmark currently showing approximate parity with
  its Vue baseline.

Source `.voo` compilation still requires Cargo, the WASM Rust target, and the
`wasm-bindgen` CLI on the author's machine. Non-trivial component code still
needs some low-level `web_sys` DOM APIs. The published packages can change
between alpha versions, and precompiled component packages that remove the Rust
requirement for consumers remain future work.

## Documentation

Start with the [documentation index](docs/README.md) for installation, component
authoring, architecture, tooling, and an honest separation between current
behavior and planned work.

## Development

Install the JavaScript dependencies and ensure the Rust WASM target and
`wasm-bindgen` CLI are available:

```sh
npm install
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli
```

Configure application Rust dependencies in the Vite plugin. Path dependencies
are resolved from the Vite application root and watched during development:

```js
vooya({
  rust: {
    dependencies: {
      serde: { version: "1", features: ["derive"] },
      "shared-engine": { path: "rust/shared-engine" },
    },
    webSysFeatures: ["HtmlCanvasElement", "CanvasRenderingContext2d"],
  },
});
```

Vooya owns the `vooya-core`, `wasm-bindgen`, `js-sys`, and `web-sys` dependency
versions in the generated application crate. Additional `web-sys` APIs are
enabled through `webSysFeatures` rather than overriding that dependency.

Run the examples:

```sh
npm run dev:vue       # Vue counter
npm run dev:react     # React counter
npm run dev:tasks     # Rust task list inside Vue
npm run dev:benchmark # Rust data grid and benchmark harness
```

Build and type-check all current examples:

```sh
npm run typecheck
npm run typecheck:react
npm run typecheck:tasks
npm run typecheck:benchmark
npm run test:voo
npm run test:portable
npm run test:hmr
npm run test:e2e
npm run build:vue
npm run build:react
npm run build:tasks
npm run build:benchmark
```

Format source components, or check formatting in CI:

```sh
npx voo-format src
npx voo-format --check src
```

Build and install the repository's VS Code extension for `.voo` contract,
embedded Rust, and scoped CSS highlighting:

```sh
npm run package:editor
code --install-extension dist/voo-vscode.vsix
```

## Versioning and alpha releases

The four `@vooya` packages use one fixed version while the compiler ABI and
framework adapters are evolving together. Changesets owns version changes, and
the release command synchronizes every published prerelease to the `alpha`
dist-tag:

```sh
npm run changeset
npm run version:packages
npm run release:alpha
```

Independent adapter versions are deferred until the generated ABI is stable.
Publishing remains an explicit maintainer action; the release command runs the
full Rust, compiler, type, browser, portable-package, HMR, and tarball gates.
Before the first stable release exists, npm may also expose the newest alpha as
`latest`; consumers should install `@vooya/*@alpha` during the preview.

## Roadmap

The detailed [project roadmap](docs/project/roadmap.md) tracks the component
contract, host-neutral view layer, adapters, build integrations, product
evidence, and precompiled distribution work. The next milestones are:

1. Grow the Rust view layer into declarative trees, reactive bindings, and
   explicit effect cleanup without hiding the underlying browser APIs.
2. Define and package precompiled component artifacts so application consumers
   do not need Cargo or `wasm-bindgen`.
3. Complete Rust editor integration; `.voo` formatting and syntax highlighting
   are available now.
4. Define state-preserving HMR semantics; successful Rust rebuilds currently
   perform a reliable full reload.
5. Expand the generated contract beyond primitive props and event payloads.
6. Establish the browser/framework compatibility matrix and public alpha
   release automation.

## Scope

Vooya is not trying to replace Vue, React, routing, application state management,
or the JavaScript ecosystem. It is a way to introduce Rust at a component
boundary where Rust provides enough value to justify the WASM cost.

See [RFC 0001](docs/rfcs/0001-component-islands.md) for the ownership boundary,
[RFC 0002](docs/rfcs/0002-reactive-component-model.md) for the current reactive
prototype, and [the data-grid benchmark plan](docs/benchmarks/data-grid.md) for
the first performance validation case.
