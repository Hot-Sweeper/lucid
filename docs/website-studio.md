# Website studio on Ares

Open Lucid and choose **Website studio** in the office toolbar, or the canvas button in a robot's chat. Select an Ares project or create one, choose a model and reasoning level from the actual Ares Codex account, and describe the website. The execution host and its working folder are shown in chat. This is a native Lucid workspace, not a separately published web application.

The configured authenticated runner route is `https://ares.tailfce843.ts.net:8446/lucid-runner`. Opening it directly in a browser should fail authentication. The old Ares Studio root on that port remains unchanged. Preview pages are proxied through project-specific loopback origins on Spacestation; the browser is never sent an Ares loopback address. Chat links to a registered Ares localhost server are rewritten to this project proxy, so they open on Spacestation correctly. Unregistered Ares localhost links show a clear error. Preview URLs are owned by the running Lucid process and expire when closed.

## Run and restart

On Spacestation, use the existing Lucid launcher or `npm start` in `/home/spacestation/Applications/lucid`. Backend changes require reopening Lucid. Source builds write `dist-build`; only the existing coordinated updater promotes the installed `dist`.

On Ares, run the existing launcher in PowerShell:

```powershell
& "$env:LOCALAPPDATA\Lucid\ares-runner\start-runner.ps1"
```

It starts an independent Windows Node process and logs beside the launcher. `runner.pid` identifies it. Before restarting an existing process, verify that PID's command line points at `electron/ares-runner/server.mjs`, then stop that process tree and run the launcher again. Do not kill unrelated Node or Codex processes. The installed runner data is `%LOCALAPPDATA%\Lucid\ares-runner-data`; keep it when replacing source. The Tailscale Serve mapping persists, but the process needs starting again after an Ares reboot. No automatic Windows startup task was added.

Check the signed connection from Spacestation with:

```sh
node scripts/ares-setup.cjs
```

The response includes the real hostname, process IDs, Node version, projects and current Codex model catalog. No Codex authentication files are copied or read by setup. Spacestation's signing identity is in `~/.config/lucid/ares.json`, mode 0600. Never put that file in a project, generated page or repository. Ares `runner.json` holds only the public verification key, loopback port and allowed existing project roots. A new connection can generate a separate identity with `node scripts/ares-setup.cjs --init --url <discovered HTTPS runner route>`; do not overwrite an existing identity casually.

The runner source is `electron/ares-runner/`, with `studio-auth.cjs`, `studio-paths.cjs` and `studio-socket.cjs` in its parent directory. The current installation uses the prototype's existing `playwright-core` dependency through a directory junction, without modifying the prototype. Keep that dependency available, or install `playwright-core` in the runner folder before removing the prototype. Chromium/Edge discovery and installed Codex executable paths are local to Ares. The installed app-server JSON schema was generated from Codex 0.167.0 during integration; Node was v24.13.0.

## Real projects and previews

New project folders live under the runner's data directory. Existing Ares folders can be attached if they fall under an explicitly configured `projectRoots` entry. Spacestation project IDs may associate an office with an Ares project; this never silently copies a local repository or changes its execution host. An idle associated robot can mirror the canvas. Active T3 work keeps its screen priority.

Static HTML/CSS/JS runs directly. For React/Vite and other supported dev servers, Codex starts the project's normal server through its scoped command tool, then calls `register_preview` with its actual printed loopback URL. Dependencies, binding or project commands may require an explicit approval in Lucid. The runner does not execute generated npm scripts as its own unrestricted child. A server that exits or needs restarting produces a recoverable preview error. Reconnect and ask Codex to start/register it again.

`view_page` renders the actual project on Ares and returns a screenshot plus console, network and overflow diagnostics. Those inspections are visible in chat. Inspection browsers block mutating network methods and service workers; use the interactive website for intentional form actions. `find_images` returns actual Wikimedia Commons images, source links and license metadata, displayed as thumbnails. Built-in search activity only shows information actually provided by Codex; missing historical search results are not fabricated.

## Cursor and interaction

Every cursor action in this integration is **reconstructed playback from saved rendered output**. It is not a recording of Codex moving a mouse or typing. Stable IDs and content identity associate changed elements; ambiguous repeated nodes are treated as replacements. Saved CSS is inlined into inert DOM versions so before styling remains stable across saves. A later save replaces the single pending render and continues from the partial build already visible.

Follow scrolls to the affected element. Turning it off lets you inspect another area. Replay explicitly starts the current render from blank. Completed projects otherwise open immediately. Reduced motion applies changes immediately, without long cursor travel or character typing. **Use website** opens the actual interactive page on a separate preview origin. Scripts are removed from playback, so replay never repeats form submissions, timers or listeners. Desktop/tablet/phone viewports remain 1440×900, 820×1180 and 390×844 regardless of display scaling. Narrow Lucid windows switch between Canvas and Chat.

Cross-origin frames, canvas/WebGL pixel contents and shadow DOM are not reconstructed as editable DOM. Use website to inspect their real runtime output. Playback snapshots are transient, not a durable recording of every file version. Chat, session associations and project files persist on Ares. Refresh reconnects to the actual session and does not send a new turn. Stop calls `turn/interrupt`; it is independent from visual catch-up.

## Security and checks

Only Electron signs runner requests. Signatures bind method, complete target, body digest, timestamp and one-use nonce. The runner rejects unsigned, expired, replayed and browser-origin requests. All runner listeners are loopback-only behind Tailscale HTTPS. No signing keys, Codex tokens or privileged IPC bridges exist in preview frames. Project origins are separate from the studio and from one another. Dotfiles, traversal, symlink escapes, Vite filesystem escape and editor-launch routes are blocked. Vite's public optimized dependency paths and its project-scoped HMR socket are supported through the authenticated connector.

Run `node scripts/verify-studio.cjs`, `node scripts/verify-frontend.cjs`, and the required `npm run verify:update`. Native QA uses `scripts/studio-native.cjs` inside the hidden agent workspace, never the user's desktop. The harness can record the actual product, emulate reduced motion and inject connector-only connection failure without disconnecting Ares or disrupting other tailnet work.
