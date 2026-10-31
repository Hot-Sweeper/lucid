import { defineConfig } from "vite";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";

// Standalone demo of the customize dialog and the hiring portraits. Never touches dist/.
export default defineConfig({
  base: "./",
  build: { outDir: "dist-customize", target: "esnext", emptyOutDir: true, rollupOptions: { input: "customize-demo.html" } },
  server: { port: 5499, strictPort: true, fs: { allow: [resolve("."), realpathSync(resolve("node_modules"))] } },
});
