import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

// Standalone demo of the games pack (src/games). Builds into dist-games so it never touches dist.
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist-games",
    target: "esnext",
    emptyOutDir: true,
    rollupOptions: { input: fileURLToPath(new URL("./games-demo.html", import.meta.url)) },
  },
  server: { port: 5311, strictPort: true, open: false, watch: { ignored: ["**/dist/**", "**/dist-*/**"] } },
});
