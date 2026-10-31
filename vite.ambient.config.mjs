import { defineConfig } from "vite";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";

// Standalone demo of the ambient animations and seasonal decor. Never touches dist/.
//   npx vite --config vite.ambient.config.mjs   (serves http://localhost:5899/ambient-demo.html)
// node_modules may be a link to another checkout, so allow its real path for font files.
export default defineConfig({
  base: "./",
  build: { outDir: "dist-ambient", target: "esnext", emptyOutDir: true, rollupOptions: { input: "ambient-demo.html" } },
  server: { port: 5899, strictPort: true, fs: { allow: [resolve("."), realpathSync(resolve("node_modules"))] }, watch: { ignored: ["**/dist/**"] } },
});
