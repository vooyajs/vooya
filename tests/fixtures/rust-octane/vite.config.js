import { octane } from "@octanejs/vite-plugin";
import { vooya } from "@vooya/vite";
import { defineConfig } from "vite";
export default defineConfig({ plugins: [octane(), vooya({ framework: "octane" })] });
