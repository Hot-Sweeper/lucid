// Dev: start Vite, then Electron pointed at it. Closing Electron stops both.
import { createServer } from "vite";
import { spawn } from "node:child_process";
import electron from "electron";

const server = await createServer({ configFile: "vite.config.mjs" });
await server.listen();
const url = `http://localhost:${server.config.server.port}/`;
const env = { ...process.env, LUCID_DEV_URL: url };
delete env.ELECTRON_RUN_AS_NODE; // set when launched from inside another Electron app such as T3 Code
const child = spawn(electron, ["."], { stdio: "inherit", env });
child.on("close", async () => { await server.close(); process.exit(0); });
