import { vooya } from "@vooya/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid(), vooya({ framework: "solid" })],
});
