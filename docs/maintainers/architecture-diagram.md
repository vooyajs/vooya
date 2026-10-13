# Maintaining the architecture diagram

[architecture.svg](../public/architecture.svg) is the editable source and the
image embedded in the root README, both documentation homepages, and the
[organization profile](https://github.com/vooyajs/.github/blob/main/profile/README.md).
Keep one canonical copy here: the organization profile links to this file on
`main`, and VitePress publishes it as `/architecture.svg`.
It is a self-contained SVG: labels are live
text, logos are vector symbols, and connectors are paths. It requires no
generator, external images, web fonts, or image-generation service.

## Make an edit

Edit the SVG in a text editor or an SVG-capable design tool. Preserve the
named groups so future changes remain easy to locate:

| Group | Contents |
| --- | --- |
| `header`, `lanes` | Title and build/runtime backgrounds |
| `bundlers`, `frameworks` | Ecosystem logo tiles and their status markers |
| `vooya-layer` | Vooya's build and runtime responsibilities |
| `language-providers`, `planned-providers` | Rust and proposed language providers |
| `rust-toolchain` | Native tools and the optional preset |
| `wasm-runtime`, `browser-apis` | Generated assets and browser capabilities |
| `connections`, `legend` | Named arrows and status explanations |

- Change labels directly in their `<text>` elements. Keep them as text rather
  than converting them to paths.
- Move a tile using its group's `transform="translate(x y)"`. Each tile groups
  its logo, label, border, and experimental marker.
- Reuse symbols with `<use href="#logo-name">`. To replace a logo, edit its
  `logo-*` symbol in `<defs>` and retain its original aspect ratio. Prefix any
  internal gradient, mask, or clip IDs so different assets cannot collide.
- Keep the toolchain-to-WASM arrow in the center gutter. Only the implemented
  Rust provider connects to the Rust toolchain. Proposed providers must not
  appear to compile through `wasm-bindgen`.
- Check the [compatibility matrix](../project/compatibility.md) before changing
  an experimental marker or moving a provider out of the planned region.
- Keep the white background, accessible title/description, and self-contained
  vector content. Do not embed a screenshot or depend on external SVG files.

Preview both the standalone SVG and its README-sized rendering. Check labels,
logo proportions, connectors, and the legend. Run `npm run verify:docs`,
`npm run docs:build`, and `git diff --check` before submitting the change.

## Logo sources

The third-party vector artwork comes from the projects below. Geometry and
colors are retained; IDs are namespaced for embedding. The React mark uses a
cyan display color, and the WebAssembly icon is selected from its full lockup.
Vite uses the classic mark from the official Vite 7 source, matching the
documented Vite 7/8 integration era.

| Symbol | Source |
| --- | --- |
| `logo-vite` | [Vite 7 logo](https://github.com/vitejs/vite/blob/v7.0.0/docs/public/logo.svg) |
| `logo-rspack` | [Rstack design resources](https://github.com/rstackjs/rstack-design-resources/blob/main/rspack/rspack-logo.svg) |
| `logo-webpack` | [webpack media](https://github.com/webpack/media/blob/master/logo/icon.svg) |
| `logo-vue` | [Vue website](https://vuejs.org/logo.svg) |
| `logo-react` | [React website header](https://react.dev/) |
| `logo-solid` | [Solid website assets](https://github.com/solidjs/solid-site/blob/main/public/img/logo/without-wordmark/logo.svg) |
| `logo-svelte` | [Svelte branding](https://github.com/sveltejs/branding/blob/master/svelte-logo.svg) |
| `logo-rust` | [Rust website](https://rust-lang.org/static/images/rust-logo-blk.svg) |
| `logo-go` | [Go website](https://go.dev/images/go-logo-blue.svg) |
| `logo-zig` | [Zig website](https://ziglang.org/favicon.svg) |
| `logo-wasm` | [WebAssembly website source](https://github.com/WebAssembly/website/blob/main/css/webassembly.svg) |

C, C++, and JavaScript use simple typographic badges authored for this diagram,
not purported official logos. Vooya uses editable text while its logo is being
decided. The generic capability and browser icons are also authored here.

Third-party marks retain their owners' terms; the repository's software license
does not relicense them. In particular, Rspack artwork is by the Rstack design
resources contributors under [CC BY-NC-SA 4.0](https://github.com/rstackjs/rstack-design-resources/blob/main/CC-BY-NC-SA-4.0.md).
See also [webpack's artwork license](https://github.com/webpack/media/blob/master/LICENSE),
[Svelte's branding guidelines](https://github.com/sveltejs/branding), and
[Go's brand guidelines](https://go.dev/brand).
