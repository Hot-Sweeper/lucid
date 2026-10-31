import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

// Standalone demo of the robot's Tasks app. Pass --outDir; it never builds into dist.
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist-tasks",
    target: "esnext",
    emptyOutDir: true,
    rollupOptions: { input: fileURLToPath(new URL("./tasks-demo.html", import.meta.url)) },
  },
  server: { port: 5298, strictPort: true, open: false },
});
