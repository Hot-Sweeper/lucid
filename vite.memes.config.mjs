import { defineConfig } from "vite";

// Standalone demo of the Botcord meme GIFs. Never touches dist/.
export default defineConfig({
  base: "./",
  build: { outDir: "dist-memes", target: "esnext", emptyOutDir: true, rollupOptions: { input: "memes-demo.html" } },
  server: { port: 5799, strictPort: true },
});
