import { defineConfig } from "vite";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";

// Demo of the outdoor city around the real World (7 rooms, the shop, weather). Never touches dist/.
//   npx vite --config vite.city.config.mjs   (serves http://localhost:5897/city-demo.html)
//   npx vite build --config vite.city.config.mjs   (builds into dist-city/)
export default defineConfig({
  base: "./",
  build: { outDir: "dist-city", target: "esnext", emptyOutDir: true, rollupOptions: { input: "city-demo.html" } },
  server: { port: 5897, strictPort: true, fs: { allow: [resolve("."), realpathSync(resolve("node_modules"))] }, watch: { ignored: ["**/dist/**", "**/dist-*/**"] } },
});
