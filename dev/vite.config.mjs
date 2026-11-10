import { defineConfig } from "vite";
import { readdirSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Dev playgrounds: isolated pages for single parts of the office (robots, apps, decor, weather).
//   npm run dev:playgrounds                        serves http://localhost:5299/dev/
//   npx vite build --config dev/vite.config.mjs    builds every page into dist-dev, never dist
// The language acceptance fixture (scripts/review/language-review.html) is built alongside them.
const root = fileURLToPath(new URL("..", import.meta.url));
const pages = readdirSync(resolve(root, "dev")).filter((f) => f.endsWith(".html"));
export default defineConfig({
  root,
  base: "./",
  build: {
    outDir: resolve(root, "dist-dev"),
    target: "esnext",
    emptyOutDir: true,
    rollupOptions: { input: [...pages.map((f) => resolve(root, "dev", f)), resolve(root, "scripts/review/language-review.html")] },
  },
  // node_modules may be a link to another checkout, so its real path is allowed for font files.
  server: { port: 5299, strictPort: true, open: "/dev/", fs: { allow: [root, realpathSync(resolve(root, "node_modules"))] }, watch: { ignored: ["**/dist/**", "**/dist-*/**"] } },
});
