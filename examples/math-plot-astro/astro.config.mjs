import vue from "@astrojs/vue";
import { vooya } from "@vooya/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
  integrations: [vue()],
  vite: {
    plugins: [vooya({
      framework: "vue",
      rust: {
        dependencies: {
          serde: { version: "1", features: ["derive"] },
          "serde_json": "1",
        },
        webSysFeatures: [
          "CanvasRenderingContext2d",
          "CssStyleDeclaration",
          "DomRect",
          "HtmlCanvasElement",
          "KeyboardEvent",
          "MouseEvent",
          "PointerEvent",
          "Storage",
          "WheelEvent",
        ],
      },
    })],
    resolve: { dedupe: ["vue"] },
  },
});
