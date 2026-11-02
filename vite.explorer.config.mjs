import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

// Isolated page for the robot Explorer and file hand-over checks. Pass --outDir; it never builds into dist.
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist-explorer",
    target: "esnext",
    emptyOutDir: true,
    rollupOptions: { input: fileURLToPath(new URL("./explorer-demo.html", import.meta.url)) },
  },
  server: { port: 5299, strictPort: true, open: false },
});
