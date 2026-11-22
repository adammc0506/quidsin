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
        whipround: resolve(import.meta.dirname, "whipround/index.html"),
        tally: resolve(import.meta.dirname, "tally/index.html"),
        killerpool: resolve(import.meta.dirname, "killerpool/index.html"),
        pickers: resolve(import.meta.dirname, "pickers/index.html"),
        sweepstake: resolve(import.meta.dirname, "sweepstake/index.html"),
        quiz: resolve(import.meta.dirname, "quiz/index.html"),
        league: resolve(import.meta.dirname, "league/index.html"),
        santa: resolve(import.meta.dirname, "santa/index.html"),
        privacy: resolve(import.meta.dirname, "privacy/index.html"),
        about: resolve(import.meta.dirname, "about/index.html"),
        // guides:start
        "secret-santa-generator": resolve(import.meta.dirname, "secret-santa-generator/index.html"),
        "sweepstake-generator": resolve(import.meta.dirname, "sweepstake-generator/index.html"),
        "pub-quiz-scorer": resolve(import.meta.dirname, "pub-quiz-scorer/index.html"),
        "killer-pool-rules": resolve(import.meta.dirname, "killer-pool-rules/index.html"),
        "league-table-maker": resolve(import.meta.dirname, "league-table-maker/index.html"),
        "split-bills-with-friends": resolve(import.meta.dirname, "split-bills-with-friends/index.html"),
        "whip-round-for-a-gift": resolve(import.meta.dirname, "whip-round-for-a-gift/index.html"),
        "random-team-generator": resolve(import.meta.dirname, "random-team-generator/index.html"),
        // guides:end
        contact: resolve(import.meta.dirname, "contact/index.html"),
      },
    },
  },
});
