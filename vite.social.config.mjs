import { defineConfig } from "vite";

// Standalone demo of the social and pastime apps. Builds into dist-social so it never touches dist/.
export default defineConfig({
  base: "./",
  build: { outDir: "dist-social", target: "esnext", emptyOutDir: true, rollupOptions: { input: "social-demo.html" } },
  server: { port: 5411, strictPort: true, open: false },
});
