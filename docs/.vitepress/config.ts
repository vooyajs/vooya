import { defineConfig } from "vitepress";

const base = process.env.VITEPRESS_BASE ?? "/";
const siteUrl = (process.env.VITEPRESS_SITE_URL ?? "").replace(/\/$/, "");
// Keep the brand asset in one place so a future logo replacement updates all surfaces.
const communityLogo = {
  sourceUrl: "https://avatars.githubusercontent.com/u/288516413?s=200&v=4",
  assetPath: `${base}vooya-logo.png`,
  alt: "Vooya",
};
const communityLogoUrl = siteUrl ? `${siteUrl}${communityLogo.assetPath}` : communityLogo.assetPath;
const siteHead = [
  ["meta", { name: "description", content: "Vooya is a framework-agnostic WASM integration layer for connecting bounded Rust capabilities to traditional Web applications." }],
  ["meta", { property: "og:title", content: "Vooya | WASM integration layer" }],
  ["meta", { property: "og:description", content: "Connect bounded Rust/WASM capabilities to traditional Web applications without replacing the host stack." }],
  ["meta", { property: "og:type", content: "website" }],
  ["meta", { property: "og:site_name", content: "Vooya" }],
  ["meta", { property: "og:image", content: communityLogoUrl }],
  ["meta", { property: "og:image:alt", content: communityLogo.alt }],
  ["meta", { name: "twitter:card", content: "summary" }],
  ["link", { rel: "icon", href: communityLogo.assetPath }],
] as const;

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
      { text: "Component", link: "/zh-CN/concepts/component" },
      { text: "Store", link: "/zh-CN/concepts/store" },
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
      { text: "API", link: "/zh-CN/reference/api" },
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
      { text: "参与贡献", link: "/zh-CN/contribute/" },
      { text: "项目概览", link: "/zh-CN/project/" },
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
        { text: "组件", link: "/zh-CN/concepts/component" },
        { text: "Store", link: "/zh-CN/concepts/store" },
        { text: "组件边界", link: "/zh-CN/concepts/component-boundary" },
      ],
    },
  ],
  "/zh-CN/examples/": [
    { text: "示例", items: [{ text: "概览", link: "/zh-CN/examples/" }] },
  ],
  "/zh-CN/reference/": [
    {
      text: "参考",
      items: [
        { text: "概览", link: "/zh-CN/reference/" },
        { text: "API", link: "/zh-CN/reference/api" },
        { text: "工具配置", link: "/zh-CN/reference/tooling" },
      ],
    },
  ],
  "/zh-CN/project/": [
    {
      text: "项目",
      items: [
        { text: "项目概览", link: "/zh-CN/project/" },
        { text: "状态", link: "/zh-CN/project/status" },
        { text: "兼容性", link: "/zh-CN/project/compatibility" },
      ],
    },
  ],
  "/zh-CN/why-vooya": [
    { text: "为什么是 Vooya", items: [{ text: "概览", link: "/zh-CN/why-vooya" }] },
  ],
  "/zh-CN/contribute/": [
    { text: "参与贡献", items: [{ text: "概览", link: "/zh-CN/contribute/" }] },
  ],
};

export default defineConfig({
  title: "Vooya",
  description: "Vooya is a framework-agnostic WASM integration layer for connecting bounded Rust capabilities to traditional Web applications.",
  head: siteHead,
  base,
  cleanUrls: true,
  lastUpdated: true,
  transformHead({ pageData }) {
    if (!siteUrl) return [];
    const route = pageData.relativePath
      .replaceAll("\\", "/")
      .replace(/(^|\/)index\.md$/, "$1")
      .replace(/\.md$/, "");
    const canonicalUrl = `${siteUrl}/${route}`;
    return [
      ["link", { rel: "canonical", href: canonicalUrl }],
      ["meta", { property: "og:url", content: canonicalUrl }],
    ];
  },
  srcExclude: ["README.md", "guide/voo-components.md"],
  locales: {
    root: { label: "English", lang: "en" },
    "zh-CN": {
      label: "简体中文",
      lang: "zh-CN",
      link: "/zh-CN/",
      description: "面向传统 Web 应用与 WASM 之间的框架无关集成层，用清晰的 Rust 组件岛边界复用浏览器 Rust 能力。",
      head: [
        ["meta", { name: "description", content: "Vooya 是面向传统 Web 应用与 WASM 之间的框架无关集成层，用清晰的 Rust 组件岛边界复用浏览器 Rust 能力。" }],
        ["meta", { property: "og:title", content: "Vooya | WASM 集成层" }],
        ["meta", { property: "og:description", content: "在不替换宿主技术栈的前提下，把边界清晰的 Rust/WASM 能力接入传统 Web 应用。" }],
      ],
      themeConfig: { nav: zhNav, sidebar: zhSidebar },
    },
  },
  themeConfig: {
    logo: { src: communityLogo.assetPath, alt: communityLogo.alt },
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
          { text: "Components", link: "/concepts/component" },
          { text: "Stores", link: "/concepts/store" },
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
          { text: "API", link: "/reference/api" },
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
            { text: "Components", link: "/concepts/component" },
            { text: "Stores", link: "/concepts/store" },
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
            { text: "API", link: "/reference/api" },
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
