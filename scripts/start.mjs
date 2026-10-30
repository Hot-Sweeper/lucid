// Launch the built app. Clears ELECTRON_RUN_AS_NODE, which leaks in when started from another Electron app.
import { spawn } from "node:child_process";
import electron from "electron";
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
spawn(electron, ["."], { stdio: "inherit", env }).on("close", (code) => process.exit(code ?? 0));
