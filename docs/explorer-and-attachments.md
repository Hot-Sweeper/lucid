# Explorer and attached files

The Explorer on a robot's computer (`src/os/explorer.ts`, `explorer.css`) is a file browser with an address bar, a folder tree, a details list, a preview side and a status bar. It is drawn only from what the agent really did.

## What it knows

`src/os/explorer-model.ts` keeps a `FolderModel`. A folder becomes listed only when a tool returned its contents (`ls`, `dir`, `Get-ChildItem`, a recursive listing). A path the agent merely touched (a glob match, a search hit, an attached file) adds its folders to the tree and itself to its own folder, and nothing more. The status bar says `12 items` for a listed folder and `2 items seen` for a folder known only from touched paths. A folder that was never opened is never shown with invented contents.

- Missing and denied folders are recognised from the tool output and say so. An empty result is an empty folder.
- Long paths fold the middle of the address bar into one entry that names what it hides. Names that do not fit end in an ellipsis and carry the full path in their tooltip.
- Recursive listings (several folders in one result) are treated as matches: the folders that hold them open, the first match is selected.
- Replaying history (`catchingUp`) draws the final state without cursor travel.

## How the robot moves

The robot walks from the folder on screen to the target: one jump up to the shared folder (the Up button or an address-bar segment), then one step per folder down by double-clicking the row or clicking the tree. A route longer than five steps is typed into the address bar. The cursor is the window manager's own, so movement, clicks and sounds match every other app.

## Sending files in a message

When an agent calls `t3_thread_send_attachments`, `Director.playAttachmentSend` plays it back through `src/os/send-files.ts`:

1. `attachment-source.ts` reads the recorded steps: the upload slot from `t3_attachment_prepare_upload`, then the shell command that posted the bytes to that slot. The path in that command is the file's real location. If the steps do not name a path (or name two equally likely ones) the folder stays unknown and no folder is shown.
2. `fs:stat` (`electron/file-facts.cjs`) reports size and modified time for those exact paths. It lists nothing and reads no content, accepts at most eight absolute local paths, refuses network shares, and answers "unknown" for a connected building.
3. For each folder the robot opens it in the Explorer, selects the files (Ctrl for several), drags them into the composer of the chat the message went to (the conversation with the user for the robot's own thread, otherwise T3 Code) and the files appear as a draft.
4. The draft shows what the real send did: a spinner while the tool call is still running, then the sent message with its files. A failed send leaves the files and the words in the composer, marked "Not sent". A later attempt replaces that draft.
5. Files whose folder is unknown, and anything past three folders, are added with the paperclip instead.

Nothing in this path uploads or sends. The upload and the send were already tool calls; the choreography only draws them. The Director plays each item once (`played`), the page used for checks counts any call to `sendMessage`, `startThread` or `saveAttachment` and fails if there is one.

Delivered files appear in the chat panel from T3's stored copy. Images preview in the viewer. Other files show "Show in folder", which `fs:reveal` allows only for files inside T3's attachment folder and Lucid's own.

## Checks

- `node scripts/checks/verify-explorer-files.mjs` (part of `npm run verify:update`): paths, routes, address folding, the model, file types, attachment sources including ambiguous and failed cases, and the file facts and reveal rules.
- `LUCID_EXPLORER_OUT=<empty folder> node_modules/electron/dist/electron.exe scripts/review/render-explorer-checks.cjs` (unset `ELECTRON_RUN_AS_NODE`): isolated native run of the production Explorer, window manager and composer against a real fixture on disk. It captures the previous Explorer from commit `fb143a8`, the nested walk, glob, search, problem states, the drag into the message box, a refused send with its kept draft and the retry, an instant replay, and the three reduced detail tiers. The robot body and the send are stubs and are labelled as such in `results.json`.
