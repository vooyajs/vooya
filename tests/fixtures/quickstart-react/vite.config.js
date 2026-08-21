import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { vooya } from "@vooya/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), vooya({ framework: "react" })],
  resolve: {
    alias: {
      "@components": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
