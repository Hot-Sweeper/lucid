import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

// Standalone demo of the fun pack. Builds into dist-fun so it never touches dist.
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist-fun",
    target: "esnext",
    emptyOutDir: true,
    rollupOptions: { input: fileURLToPath(new URL("./fun-demo.html", import.meta.url)) },
  },
  server: { port: 5299, strictPort: true, open: false },
});
