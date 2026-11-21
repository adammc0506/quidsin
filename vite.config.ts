import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" so the same build works on the web and inside the Android app.
export default defineConfig({
  base: "./",
  plugins: [react()],
});
