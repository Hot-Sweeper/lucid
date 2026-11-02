import { defineConfig } from "vite";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";

// Test bench for the robot's hand, the Codex image view and the leisure apps. Never touches dist/.
export default defineConfig({
  base: "./",
  build: { outDir: "dist-content", target: "esnext", emptyOutDir: true, rollupOptions: { input: "content-demo.html" } },
  server: { port: 5521, strictPort: true, fs: { allow: [resolve("."), realpathSync(resolve("node_modules"))] } },
});
