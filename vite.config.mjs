import { defineConfig } from "vite";
import fs from "node:fs";
import buildState from "./electron/build-state.cjs";
let buildFiles;
let buildOutDir = "dist";
export default defineConfig({
  plugins: [{ name: "lucid-build-state", configResolved(config) { buildOutDir = config.build.outDir; }, buildStart() { buildFiles = buildState.snapshot(process.cwd()); }, closeBundle() {
    if (buildState.changed(buildFiles, buildState.snapshot(process.cwd())).length) throw new Error("Source changed during the build. Run the build again.");
    fs.writeFileSync(`${buildOutDir}/lucid-build.json`, JSON.stringify({ files: buildFiles, builtAt: new Date().toISOString() }));
  } }],
  base: "./",
  build: { outDir: "dist", target: "esnext", emptyOutDir: true },
  server: { port: 5199, strictPort: true },
});
