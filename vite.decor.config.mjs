import { defineConfig } from "vite";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";

// Standalone demo of the office decor pack. Never touches dist/.
// node_modules may be a link to another checkout, so allow its real path for font files.
export default defineConfig({
  base: "./",
  build: { outDir: "dist-decor", target: "esnext", emptyOutDir: true, rollupOptions: { input: "decor-demo.html" } },
  server: { port: 5699, strictPort: true, fs: { allow: [resolve("."), realpathSync(resolve("node_modules"))] } },
});
