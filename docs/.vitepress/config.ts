import { defineConfig } from "vitepress";

const base = process.env.VITEPRESS_BASE ?? "/";

const zhNav = [
  {
    text: "指南",
    items: [
      { text: "概览", link: "/zh-CN/guide/" },
      { text: "为什么是 Vooya", link: "/zh-CN/why-vooya" },
      { text: "快速开始", link: "/zh-CN/guide/getting-started" },
      { text: "Rust 编写", link: "/zh-CN/guide/rust-file-authoring" },
      { text: "Bundler", link: "/zh-CN/guide/bundlers" },
      { text: "排错", link: "/zh-CN/guide/troubleshooting" },
      { text: "示例", link: "/zh-CN/examples/" },
    ],
  },
  {
    text: "概念",
    items: [
      { text: "概览", link: "/zh-CN/concepts/" },
      { text: "为什么是 Vooya", link: "/zh-CN/why-vooya" },
      { text: "组件边界", link: "/zh-CN/concepts/component-boundary" },
      {
        text: "设计记录",
        items: [
          { text: "生命周期与事件（英文）", link: "/rfcs/0005-island-events-lifecycle-diagnostics" },
          { text: "ABI v1（英文）", link: "/rfcs/0007-rust-file-authoring-and-abi-v1" },
        ],
      },
    ],
  },
  {
    text: "参考",
    items: [
      { text: "工具配置", link: "/zh-CN/reference/tooling" },
      { text: "兼容性", link: "/zh-CN/project/compatibility" },
      { text: "FAQ", link: "/zh-CN/faq" },
    ],
  },
  {
    text: "项目",
    items: [
      { text: "状态", link: "/zh-CN/project/status" },
      { text: "路线图与 RFC（英文）", link: "/rfcs/0008-layer-boundary-and-roadmap" },
      { text: "基准测试（英文）", link: "/benchmarks/data-grid" },
      { text: "参与贡献（英文）", link: "/contribute/" },
    ],
  },
  { text: "GitHub", link: "https://github.com/vooyajs/vooya" },
];

const zhSidebar = {
  "/zh-CN/guide/": [
    {
      text: "指南",
      items: [
        { text: "概览", link: "/zh-CN/guide/" },
        { text: "为什么是 Vooya", link: "/zh-CN/why-vooya" },
        { text: "快速开始", link: "/zh-CN/guide/getting-started" },
        { text: "Rust 编写", link: "/zh-CN/guide/rust-file-authoring" },
        { text: "Bundler", link: "/zh-CN/guide/bundlers" },
        { text: "排错", link: "/zh-CN/guide/troubleshooting" },
      ],
    },
  ],
  "/zh-CN/concepts/": [
    {
      text: "概念",
      items: [
        { text: "概览", link: "/zh-CN/concepts/" },
        { text: "为什么是 Vooya", link: "/zh-CN/why-vooya" },
        { text: "组件边界", link: "/zh-CN/concepts/component-boundary" },
      ],
    },
  ],
  "/zh-CN/examples/": [
    { text: "示例", items: [{ text: "概览", link: "/zh-CN/examples/" }] },
  ],
  "/zh-CN/reference/": [
    { text: "参考", items: [{ text: "工具配置", link: "/zh-CN/reference/tooling" }] },
  ],
  "/zh-CN/project/": [
    {
      text: "项目",
      items: [
        { text: "状态", link: "/zh-CN/project/status" },
        { text: "兼容性", link: "/zh-CN/project/compatibility" },
      ],
    },
  ],
  "/zh-CN/why-vooya": [
    { text: "为什么是 Vooya", items: [{ text: "概览", link: "/zh-CN/why-vooya" }] },
  ],
};

export default defineConfig({
  title: "Vooya",
  description: "Vooya is a WASM integration layer for adding bounded Rust capabilities to existing Vue and React Web applications.",
  base,
  cleanUrls: true,
  lastUpdated: true,
  srcExclude: ["README.md", "guide/voo-components.md"],
  locales: {
    root: { label: "English", lang: "en" },
    "zh-CN": {
      label: "简体中文",
      lang: "zh-CN",
      link: "/zh-CN/",
      description: "面向现有 Vue、React Web 应用的 WASM 集成层，用清晰的 Rust 组件岛边界复用浏览器 Rust 能力。",
      themeConfig: { nav: zhNav, sidebar: zhSidebar },
    },
  },
  themeConfig: {
    siteTitle: "Vooya",
    nav: [
      {
        text: "Guide",
        items: [
          { text: "Overview", link: "/guide/" },
          { text: "Why Vooya?", link: "/why-vooya" },
          { text: "Getting started", link: "/guide/getting-started" },
          { text: "Rust authoring", link: "/guide/rust-file-authoring" },
          { text: "Bundlers", link: "/guide/bundlers" },
          { text: "Troubleshooting", link: "/guide/troubleshooting" },
          { text: "Examples", link: "/examples/" },
        ],
      },
      {
        text: "Concepts",
        items: [
          { text: "Overview", link: "/concepts/" },
          { text: "Why Vooya?", link: "/why-vooya" },
          { text: "Component boundary", link: "/concepts/component-boundary" },
          {
            text: "Design records",
            items: [
              { text: "Lifecycle and events", link: "/rfcs/0005-island-events-lifecycle-diagnostics" },
              { text: "ABI v1", link: "/rfcs/0007-rust-file-authoring-and-abi-v1" },
            ],
          },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "Tooling", link: "/reference/tooling" },
          { text: "Compatibility", link: "/project/compatibility" },
          { text: "FAQ", link: "/faq" },
        ],
      },
      {
        text: "Project",
        items: [
          { text: "Status", link: "/project/status" },
          { text: "Roadmap and RFCs", link: "/rfcs/0008-layer-boundary-and-roadmap" },
          { text: "Benchmarks", link: "/benchmarks/data-grid" },
          { text: "Contributing", link: "/contribute/" },
        ],
      },
      { text: "GitHub", link: "https://github.com/vooyajs/vooya" },
    ],
    sidebar: {
      "/guide/": [
        {
          text: "Guides",
          items: [
            { text: "Overview", link: "/guide/" },
            { text: "Why Vooya?", link: "/why-vooya" },
            { text: "Getting started", link: "/guide/getting-started" },
            { text: "Rust-file authoring", link: "/guide/rust-file-authoring" },
            { text: "Bundlers", link: "/guide/bundlers" },
            { text: "Scatter plot", link: "/guide/scatter-plot" },
            { text: "Troubleshooting", link: "/guide/troubleshooting" },
          ],
        },
      ],
      "/concepts/": [
        {
          text: "Concepts",
          items: [
            { text: "Overview", link: "/concepts/" },
            { text: "Why Vooya?", link: "/why-vooya" },
            { text: "Component boundary", link: "/concepts/component-boundary" },
          ],
        },
      ],
      "/examples/": [
        {
          text: "Examples",
          items: [{ text: "Overview", link: "/examples/" }],
        },
      ],
      "/reference/": [
        {
          text: "Reference",
          items: [
            { text: "Overview", link: "/reference/" },
            { text: "Tooling", link: "/reference/tooling" },
          ],
        },
      ],
      "/project/": [
        {
          text: "Project",
          items: [
            { text: "Overview", link: "/project/" },
            { text: "Status", link: "/project/status" },
            { text: "Compatibility", link: "/project/compatibility" },
          ],
        },
      ],
      "/contribute/": [
        {
          text: "Contributing",
          items: [{ text: "Overview", link: "/contribute/" }],
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
      "/why-vooya": [
        { text: "Why Vooya?", items: [{ text: "Overview", link: "/why-vooya" }] },
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
