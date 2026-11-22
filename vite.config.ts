import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The website: Tab & Tally hub at "/" and the QuidsIn app at "/quidsin/".
// Each tool is its own page; the Android app uses vite.app.config.ts instead.
export default defineConfig({
  base: "/",
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        hub: resolve(import.meta.dirname, "index.html"),
        quidsin: resolve(import.meta.dirname, "quidsin/index.html"),
      },
    },
  },
});
