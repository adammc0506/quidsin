import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The Android app (Capacitor) holds just QuidsIn, built with relative paths.
export default defineConfig({
  root: "quidsin",
  base: "./",
  publicDir: "../public",
  envDir: "..",
  plugins: [react()],
  build: { outDir: "../dist-app", emptyOutDir: true },
});
