import { defineConfig } from "vite";
import fs from "node:fs";
import buildState from "./electron/build-state.cjs";
let buildFiles;
let buildOutDir = "dist-build";
export default defineConfig({
  plugins: [{ name: "lucid-build-state", configResolved(config) { buildOutDir = config.build.outDir; }, buildStart() { buildFiles = buildState.snapshot(process.cwd()); }, closeBundle() {
    if (buildState.changed(buildFiles, buildState.snapshot(process.cwd())).length) throw new Error("Source changed during the build. Run the build again.");
    fs.writeFileSync(`${buildOutDir}/lucid-build.json`, JSON.stringify({ files: buildFiles, builtAt: new Date().toISOString() }));
  } }],
  base: "./",
  // Ordinary builds and verify:update must never replace the running office's
  // assets. The updater explicitly builds dist-update and promotes it only
  // after validation. Preview output can be discarded independently.
  build: { outDir: "dist-build", target: "esnext", emptyOutDir: true },
  server: { port: 5199, strictPort: true },
});
