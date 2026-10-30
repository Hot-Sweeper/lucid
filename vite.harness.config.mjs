// Dev server and build for the harness app demo only.
//   npx vite --config vite.harness.config.mjs        (serves http://localhost:5599/harness-demo.html)
//   npx vite build --config vite.harness.config.mjs  (builds into dist-harness)
import { defineConfig } from "vite";
import { realpathSync } from "node:fs";

// node_modules may be a junction into another checkout; allow serving files (fonts) from its real location.
const modules = realpathSync("node_modules");

export default defineConfig({
  base: "./",
  build: { outDir: "dist-harness", target: "esnext", emptyOutDir: true, rollupOptions: { input: "harness-demo.html" } },
  server: {
    port: 5599,
    strictPort: true,
    open: false,
    fs: { allow: [".", modules] },
    // other builds write into dist; those must not reload the demo
    watch: { ignored: ["**/dist/**", "**/dist-harness/**"] },
  },
});
