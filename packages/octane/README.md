# @vooya/octane

Experimental native Octane adapter for Vooya Rust `.rs` components and stores.
It uses Octane's own hooks and compiler, without a React runtime bridge.

This is a **private workspace experiment**, deferred from the first 0.2 release.
There is no published `@vooya/octane` version to install. The independent packed
fixture is retained; it is not part of the public release gate. Making this
package public requires a reviewed first-release Changeset and consumer acceptance.

The verified toolchain is **Octane 0.9.0**, **@octanejs/vite-plugin 0.2.1**,
**Vite 8.0.16**, **TypeScript 5.9.3**, and **Node 22.22.2 or newer**.
Older Octane versions (including 0.4.3) are not covered.

```js
import { defineConfig } from "vite";
import { octane } from "@octanejs/vite-plugin";
import { vooya } from "@vooya/vite";

export default defineConfig({
  plugins: [octane(), vooya({ framework: "octane" })],
});
```

Import Rust components as defaults and stores through their generated hooks:

```tsx
/** @jsxImportSource octane */
import Counter from "./Counter.rs";
import { useCart } from "./Store.rs";

export function App() {
  const { state, add } = useCart();
  return <>
    <Counter count={state?.count ?? 0} />
    <button onClick={() => add(1)}>Add</button>
  </>;
}
```

Each mounted hook owns one Rust store. `state` is `undefined` while WASM loads;
`null` remains a valid snapshot. Component props update the Rust handle, events
map to `onEventName` callbacks, and unmount releases listeners and owned handles.
Direct `useVooyaStore(factory, props, options)` supports existing store factories;
`onError` reports creation failures and `onNotify` receives notifications.

This package intentionally ships authored TypeScript/TSX. Octane compiles it in
the consuming application so hook slots and runtime versions agree. Configure
`jsx: "preserve"` and `jsxImportSource: "octane"` when type-checking TSX consumers.
See [Octane's library contract](https://octanejs.dev/docs/publishing-libraries).

Current scope: client-side Rust components and stores through Vite. Legacy
`.voo`, SSR/hydration, Strong mode, and other bundlers are not verified for this
adapter. Run `node tests/rust-octane-source.mjs` from the repository for the
packed-package production browser check.
