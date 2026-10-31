import { defineConfig } from "vite";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";

// Standalone demo of the seated desk robot (every pose, several robots at once). Never touches dist/.
export default defineConfig({
  base: "./",
  build: { outDir: "dist-seated", target: "esnext", emptyOutDir: true, rollupOptions: { input: "seated-demo.html" } },
  server: { port: 5498, strictPort: true, fs: { allow: [resolve("."), realpathSync(resolve("node_modules"))] } },
});
