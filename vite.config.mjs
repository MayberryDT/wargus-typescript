import { defineConfig } from "vite";

// Nested worktrees and evidence trees exhaust fs.inotify watches when Vite
// default-watches the whole project root. Verifiers spawn a second dev server
// while a long-lived user preview may already hold tens of thousands of watches.
export default defineConfig({
  server: {
    watch: {
      ignored: [
        "**/.worktrees/**",
        "**/.git/**",
        "**/dist/**",
        "**/.artifacts/**",
        "**/.superpowers/**",
        "**/.netlify/**",
        "**/plans/evidence/**",
        "**/node_modules/**",
      ],
    },
  },
});
