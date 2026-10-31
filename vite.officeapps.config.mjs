import { defineConfig } from "vite";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";

// Demo of the office suite (Botword, Cellsheet, Slidedeck). Never touches dist/. No HMR, so other people's
// edits in the repo do not reload a capture run halfway through.
//   npx vite --config vite.officeapps.config.mjs   (serves http://localhost:5913/officeapps-demo.html)
export default defineConfig({
  base: "./",
  build: { outDir: "dist-officeapps", target: "esnext", emptyOutDir: true, rollupOptions: { input: "officeapps-demo.html" } },
  server: { port: 5913, strictPort: true, hmr: false, fs: { allow: [resolve("."), realpathSync(resolve("node_modules"))] }, watch: { ignored: ["**/dist/**", "**/dist-*/**"] } },
});
