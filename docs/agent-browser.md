# Actual agent browser pages

Lucid follows browsers explicitly identified in completed agent-workspace tool events. `WorkspaceBrowserTracker` unwraps MCP results, retains the workspace session and browser app handles, and follows subsequent navigation and input. The director handles both completed streaming events and normal tool playback. Linked environments never resolve those handles against this computer.

`frontend:frame` routes workspace sources to `electron/workspace-browser.cjs`. It validates the saved workspace session and browser command before requesting a screenshot of that app's window through the installed agent-workspace CLI. It never captures the root desktop, navigates another browser, copies cookies, or sends input. The renderer displays the actual window, including native tabs and address bar, without a duplicate Lucid toolbar. Images retain their aspect ratio. The title follows the live window, including navigation not accompanied by another tool result.

Visible views request at most one capture per second. Requests for the same source share in-flight work. Hidden, inactive and covered views pause. Captures use temporary files removed after encoding; closed views and renderer destruction release their session ownership. Old workspace IDs cannot attach to a new workspace session. Stopped or unavailable browsers retain an explicit waiting state.

Checks:

- `node scripts/verify-workspace-browser.mjs`: event parsing, actual browser handles, navigation, failure, terminal isolation, stop and reset.
- `node scripts/verify-workspace-browser.cjs`: command scope, session reuse, ownership, pause, stable frames and cleanup.
- `node scripts/verify-frontend-client.mjs`: serial polling, suspension, recovery and disposal.
- `node scripts/verify-frontend.cjs`: native frontend sandbox and session lifecycle.
- `npm run verify:update`: required repository validation and candidate build.

Native verification uses two hidden KWin workspaces: Firefox on the source workspace and Lucid on the observer workspace. This keeps switching or covering the source browser from hiding the observer. Feed the observed tool result into the real director, navigate Firefox, and verify that the monitor title and pixels change to the new page. Capture the monitor itself as result evidence. A separately loaded URL or a generated test page does not verify that workflow.
