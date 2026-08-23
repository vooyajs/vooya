import { defineConfig } from "vitepress";

const base = process.env.VITEPRESS_BASE ?? "/";

export default defineConfig({
  title: "Vooya",
  description: "A WASM integration layer for existing Web applications.",
  base,
  cleanUrls: true,
  lastUpdated: true,
  srcExclude: ["README.md", "guide/voo-components.md"],
  themeConfig: {
    siteTitle: "Vooya",
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "Concepts", link: "/concepts/component-boundary" },
      { text: "Reference", link: "/reference/tooling" },
      { text: "Project", link: "/project/status" },
      { text: "RFCs", link: "/rfcs/0008-layer-boundary-and-roadmap" },
      { text: "GitHub", link: "https://github.com/vooyajs/vooya" },
    ],
    sidebar: {
      "/guide/": [
        {
          text: "Guides",
          items: [
            { text: "Getting started", link: "/guide/getting-started" },
            { text: "Rust-file authoring", link: "/guide/rust-file-authoring" },
            { text: "Scatter plot", link: "/guide/scatter-plot" },
          ],
        },
      ],
      "/concepts/": [
        {
          text: "Concepts",
          items: [
            { text: "Component boundary", link: "/concepts/component-boundary" },
          ],
        },
      ],
      "/reference/": [
        {
          text: "Reference",
          items: [
            { text: "Tooling", link: "/reference/tooling" },
          ],
        },
      ],
      "/project/": [
        {
          text: "Project",
          items: [
            { text: "Status", link: "/project/status" },
            { text: "Compatibility", link: "/project/compatibility" },
          ],
        },
      ],
      "/benchmarks/": [
        {
          text: "Benchmarks",
          items: [
            { text: "Benchmark plan", link: "/benchmarks/data-grid" },
            { text: "Data-grid result", link: "/benchmarks/2026-07-data-grid" },
            { text: "Trace waterfall", link: "/benchmarks/trace-waterfall" },
          ],
        },
      ],
      "/rfcs/": [
        {
          text: "Design records",
          items: [
            { text: "Layer boundary and roadmap", link: "/rfcs/0008-layer-boundary-and-roadmap" },
            { text: "Rust-file authoring and ABI v1", link: "/rfcs/0007-rust-file-authoring-and-abi-v1" },
            { text: "Island events and lifecycle", link: "/rfcs/0005-island-events-lifecycle-diagnostics" },
            { text: "Component islands", link: "/rfcs/0001-component-islands" },
          ],
        },
      ],
    },
    socialLinks: [{ icon: "github", link: "https://github.com/vooyajs/vooya" }],
    search: { provider: "local" },
    footer: {
      message: "Vooya is an alpha project. Check the compatibility matrix before relying on a path.",
      copyright: "MIT OR Apache-2.0",
    },
  },
});
