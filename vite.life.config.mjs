import { defineConfig } from "vite";

// Standalone demo of the life apps (BeatLab and Botcord). Never touches dist/.
export default defineConfig({
  base: "./",
  build: { outDir: "dist-life", target: "esnext", emptyOutDir: true, rollupOptions: { input: "life-demo.html" } },
  server: { port: 5399, strictPort: true },
});
