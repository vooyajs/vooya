# Astro client islands

Vooya reuses Astro's official Vue integration; it does not require a custom
Astro renderer. The verified path is Astro 7.3.2, `@astrojs/vue` 7.0.2,
`@vooya/vue`, and `@vooya/vite`.

```js
import vue from "@astrojs/vue";
import { vooya } from "@vooya/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
  integrations: [vue()],
  vite: { plugins: [vooya({ framework: "vue" })] },
});
```

Import an ordinary `.rs` component from a Vue wrapper and mount the wrapper
with `client:only="vue"`. Include readable HTML in its fallback slot. Current
evidence covers client mounting, primitive props, typed custom events, scoped
CSS, shared WASM initialization, disposal/remount, and static output. It does
not claim SSR or hydration support.

Astro uses more than one Vite environment. Vooya makes its initial Rust build
idempotent per plugin instance and ignores its generated `.vooya` workspace in
HMR. The release proof deliberately runs dev mounting and then `astro check`
followed by `astro build` in a clean consumer.

See the complete [Math Plot Astro example](https://github.com/vooyajs/vooya/tree/main/examples/math-plot-astro).
