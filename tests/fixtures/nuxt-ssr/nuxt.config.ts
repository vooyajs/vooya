import { vooya } from "@vooya/vite";

export default defineNuxtConfig({
  compatibilityDate: "2026-09-30",
  devtools: { enabled: false },
  vite: { plugins: [vooya()] },
});
