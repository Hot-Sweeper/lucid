import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  build: { outDir: "dist", target: "esnext", emptyOutDir: true },
  server: { port: 5199, strictPort: true },
});
