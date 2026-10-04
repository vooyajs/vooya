# Other integrations

For a first Vue or React component in Vite, follow [Getting Started](./getting-started.md).
These setup notes cover additional frameworks and bundlers. They require the same
[local Rust tools](./getting-started.md#prerequisites); the
[compatibility matrix](../project/compatibility.md) records the acceptance boundary.

## Solid

Experimental: Solid `>=1.9 <2`, with Vite 7 evidence. The Store examples below
assume you have authored the imported Rust roots; see [Store authoring](../concepts/store.md).

Install the Solid adapter and Vite plugin in an existing Solid application:

```sh
npm install @vooya/solid@beta
npm install --save-dev @vooya/vite@beta
```

Select the Solid adapter after `vite-plugin-solid`:

```js
import { vooya } from "@vooya/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid(), vooya({ framework: "solid" })],
});
```

Generated Store state follows Solid conventions and is read as an accessor:

```tsx
import Counter from "./Counter.rs";
import { useCart } from "./Store.rs";

export function App() {
  const { state, add } = useCart();
  return <Counter count={state()?.count ?? 0} onSelected={console.log} />;
}
```

Continue to [the shared toolchain and TypeScript checks](./getting-started.md#verify-before-the-first-dev-run)
before starting Vite.

## Svelte

Experimental: Svelte `>=5 <6`, with Vite 7 evidence. The imported Rust roots
come from your application; see the [Svelte fixture](https://github.com/vooyajs/vooya/tree/main/tests/fixtures/rust-svelte).

Install the Svelte 5 adapter and Vite plugin in an existing Svelte application:

```sh
npm install @vooya/svelte@beta
npm install --save-dev @vooya/vite@beta
```

Configure `@sveltejs/vite-plugin-svelte` before Vooya:

```js
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { vooya } from "@vooya/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [svelte(), vooya({ framework: "svelte" })],
});
```

Import ordinary Rust files from a `.svelte` component. Callback events use
`onEventName` props, and generated Store state is a Svelte `Readable` consumed
with `$state` in the template:

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

Continue to [the shared toolchain and TypeScript checks](./getting-started.md#verify-before-the-first-dev-run)
before starting Vite.

## Vite+

Vite+ is a unified CLI and toolchain around Vite, not a separate Vooya adapter.
The tested Vite+ path uses Vite+ 0.2.9's Vite core alias and the same
`vooya()` plugin configuration:

```sh
npm install --save-dev vite-plus@0.2.9
npx vp build
```

For a project managed by Vite+, follow its installation and migration guide,
including the documented `vite` alias to
`@voidzero-dev/vite-plus-core`. Keep `vooya()` in the normal Vite plugin list;
the current fixture needs npm's legacy peer resolver because the aliased core
uses Vite+'s `0.x` version instead of Vite's peer version. This is a recorded
Vite+ integration cost, not a requirement of the normal Vite path. The
Vooya compatibility check is:

```sh
npm run test:vite-plus
```

This is a compatibility smoke path, not a claim that Vooya owns Vite+'s
runtime, package manager, task runner, or every bundled tool.

## Experimental Rspack path

For an existing Rsbuild Vue application, install the Vue adapter and Rspack
integration from the same beta channel:

```sh
npm install @vooya/vue@beta
npm install --save-dev @vooya/rspack@beta
```

Add the integration beside the normal Vue plugin:

```ts
import { defineConfig } from "@rsbuild/core";
import { pluginVue } from "@rsbuild/plugin-vue";
import { vooyaRsbuild } from "@vooya/rspack";

export default defineConfig({
  plugins: [pluginVue(), vooyaRsbuild()],
});
```

React projects use `vooyaRsbuild({ framework: "react" })` with their normal
Rsbuild React plugin. Direct Rspack configuration is documented in the
[`@vooya/rspack` package README](https://github.com/vooyajs/vooya/blob/main/packages/rspack/README.md).

This path currently requires Rspack `>=2.1.10` and the same local Rust/WASM
tools as Vite. It is experimental; SSR, Module Federation, and earlier Rspack
versions are not support claims. Exact fixture evidence currently uses 2.1.10.

## Experimental Webpack 5 path

Install the framework adapter and Webpack integration from the same `beta`
channel. The current experimental range is Webpack `>=5`.

```sh
npm install @vooya/vue@beta
npm install --save-dev @vooya/webpack@beta
```

Add the plugin's loader rule alongside the application's normal framework and
CSS rules:

```js
import { vooyaWebpack } from "@vooya/webpack";

const vooya = vooyaWebpack({ framework: "vue" });

export default {
  experiments: { asyncWebAssembly: true },
  module: {
    rules: [
      vooya.rule(),
      { test: /\.css$/, use: ["style-loader", "css-loader"] },
    ],
  },
  plugins: [vooya],
};
```

React projects select `framework: "react"`. Webpack Dev Server uses full-page
live reload after successful Rust rebuilds; component state is not preserved.
Webpack 4, Module Federation, SSR, and hydration are outside the current claim.
