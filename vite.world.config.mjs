import { defineConfig } from "vite";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";

// Standalone demo of the world characters and rooms. Never touches dist/.
// node_modules may be a link to another checkout, so allow its real path for font files.
export default defineConfig({
  base: "./",
  build: { outDir: "dist-world", target: "esnext", emptyOutDir: true, rollupOptions: { input: "world-demo.html" } },
  server: { port: 5499, strictPort: true, fs: { allow: [resolve("."), realpathSync(resolve("node_modules"))] } },
});
