# Other integrations

For a first Vue or React component in Vite, follow [Getting Started](./getting-started.md).
These setup notes cover additional frameworks and bundlers. They require the same
[local Rust tools](./getting-started.md#prerequisites); the
[compatibility matrix](../project/compatibility.md) records the acceptance boundary.

## Solid

Experimental: Solid `>=1.9 <2`. Published beta evidence covers Vite 7;
Vite 8 and Vite+ 0.2.9 packed fixtures exercise unreleased source. The Store examples below
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

Experimental: Svelte `>=5 <6`. Published beta evidence covers Vite 7;
Vite 8 and Vite+ 0.2.9 packed fixtures exercise unreleased source. The imported Rust roots
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

::: info Unreleased 0.2 evidence
This setup is verified with packages built from the current checkout. It does
not establish the same four-framework compatibility for npm `@beta` packages.
Keep the ordinary Vite quickstart for the published path. See
[the next-release overview](../project/next-release.md) before testing source.
:::

Use the same `@vooya/vite` plugin with Vite+. The verified combination is
Vite+ **0.2.9** and `@voidzero-dev/vite-plus-core` **0.2.9**, which exposes
Vite **8.2.1**. Keep the normal framework plugin and Vooya adapter from your
existing setup, then add these fields to `package.json`:

```json
{
  "scripts": {
    "dev": "vp dev",
    "build": "vp build"
  },
  "devDependencies": {
    "vite-plus": "0.2.9",
    "vite": "npm:@voidzero-dev/vite-plus-core@0.2.9"
  },
  "overrides": {
    "vite": "npm:@voidzero-dev/vite-plus-core@0.2.9",
    "vitest": "4.1.10"
  }
}
```

These npm aliases and overrides follow the [Vite+ migration rules](https://viteplus.dev/guide/migrate-rules).
If your project directly depends on Vitest, also pin that dependency to `4.1.10`,
the version bundled with Vite+ 0.2.9. This setup installs with normal `npm install`;
`--legacy-peer-deps` is not needed.

Import `defineConfig` from `vite-plus`. For example, a Vue configuration is:

```ts
import { defineConfig } from "vite-plus";
import vue from "@vitejs/plugin-vue";
import { vooya } from "@vooya/vite";

export default defineConfig({
  plugins: [vue(), vooya({ framework: "vue" })],
});
```

Run `npm install`, then `npm run dev` or `npm run build`. React, Solid and Svelte
retain their respective framework plugins and `vooya({ framework })` settings.
The Svelte Vite 8 fixture uses `@sveltejs/vite-plugin-svelte` 7.1.2.
Octane remains a private workspace experiment outside this release matrix.

`npm run test:vite-plus-frameworks` checks all four frameworks using clean
packed consumers: `.rs` components and Stores, production browser interactions,
strict generated declarations, development rebuilds, Rust error recovery and
host component edits. Rust edits trigger a full page reload, not state-preserving
HMR. `npm run test:vite-plus` separately retains the legacy `.voo` regression.
These checks cover Vite+ dev/build integration at the pinned version; they do
not cover every bundled Vite+ tool or imply SSR support.

## Experimental Rspack path

::: warning Rust-file support is unreleased
The npm 0.1 beta adapter covers transitional `.voo` regression fixtures, not
the supported `.rs` authoring path. The configuration below documents the
current source for the proposed 0.2 batch. Use Vite with published packages for
a new Rust-file application; see the [release boundary](../project/next-release.md).
:::

For a source evaluation, use matching candidate tarballs for the Vue adapter
and Rspack integration, including their exact internal dependencies. The
repository
[`test:rust-bundlers` consumer](https://github.com/vooyajs/vooya/blob/main/tests/rust-bundler-source.mjs)
performs that installation; there is no published 0.2 install command yet.

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

::: warning Rust-file support is unreleased
The npm 0.1 beta adapter covers transitional `.voo` regression fixtures, not
the supported `.rs` authoring path. The configuration below documents the
current source for the proposed 0.2 batch. Use Vite with published packages for
a new Rust-file application; see the [release boundary](../project/next-release.md).
:::

Use the framework adapter and Webpack integration from the same source
candidate, as in `test:rust-bundlers`. Installing `@vooya/webpack@beta` does not
provide this Rust-file integration. The candidate experimental range is
Webpack `>=5`.

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
