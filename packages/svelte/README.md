# `@vooya/svelte`

Experimental Svelte 5 host adapter for Vooya Rust Components and
instance-scoped Stores.

The peer range is Svelte `>=5 <6`. Current end-to-end evidence covers Svelte 5,
Vite 7, and Chromium, including exactly one Component handle and generated Store
disposal after a child component is unmounted. It does not imply Svelte 3/4,
SvelteKit, SSR, hydration, Vite 8, Rspack, Webpack, or other browser support.

```sh
npm install @vooya/svelte@alpha
npm install --save-dev @vooya/vite@alpha
```

Configure `@sveltejs/vite-plugin-svelte` before Vooya:

```ts
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { vooya } from "@vooya/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [svelte(), vooya({ framework: "svelte" })],
});
```

Use generated exports from ordinary Rust files in a `.svelte` component:

```svelte
<script>
  import Counter from "./Counter.rs";
  import { useCart } from "./Store.rs";

  const { state, add } = useCart();
  let selected;
</script>

<Counter count={$state?.count ?? 0} onSelected={(value) => selected = value} />
<button onclick={() => add(1)}>Store {$state?.count ?? 0}</button>
```

The generated `useName()` API keeps the same names and fields as the other
adapters. Its `state` is a Svelte `Readable<T | undefined>`; `undefined` means
the asynchronous WASM Store is not ready, and Svelte templates read it through
the `$state` auto-subscription.

The generator passes the same framework-neutral Component and Store bridges to
this adapter. Svelte owns component placement, lifecycle, and reactivity; Rust
owns the mounted subtree and Store resources. The bridge is generated
implementation output, not a stable public IR for applications to author.

`useVooyaStore(factory, props, options?)` is an advanced adapter API for custom
ownership. The generated `useName()` entry is the normal application path.
