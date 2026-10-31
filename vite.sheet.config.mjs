import { defineConfig } from "vite";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";

// Demo of a robot's screen apps: sprite sheets that play like a video, and real browser pages.
// Never touches dist/. No HMR, so a capture run is not reloaded halfway.
//   npx vite --config vite.sheet.config.mjs   (serves http://localhost:5933/sheet-demo.html)
export default defineConfig({
  base: "./",
  build: { outDir: "dist-sheet", target: "esnext", emptyOutDir: true, rollupOptions: { input: "sheet-demo.html" } },
  server: { port: 5933, strictPort: true, hmr: false, fs: { allow: [resolve("."), realpathSync(resolve("node_modules"))] }, watch: { ignored: ["**/dist/**", "**/dist-*/**"] } },
});
