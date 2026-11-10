# T3 window parity

Goal: the app becomes the window the user works in instead of T3 Code's own. This page lists what T3's window offers, what the app already covers, what is missing, and a rough effort for each gap.

Sources: T3's server bundle (`ManagedEndpointRuntime-*.mjs` for schemas, `server-*.mjs` for the RPC scope table `RPC_REQUIRED_SCOPES`, `runtimeLayer-*.mjs` for the command decider) and its web client (`runtime-*.js`, `EnvironmentCommands.*`). Protocol is orchestration v2 (`t3server.cjs` connects with `orchestrationProtocol=2`).

Effort: **S** = a handler in `t3server.cjs`/`main.cjs` plus a menu item or button (hours). **M** = new UI surface or new data reads (a day or two). **L** = a new subsystem (several days).

## How the app talks to T3 today

- **Commands:** `t3server.cjs` `dispatch(command)` (line 342) sends `orchestration.dispatchCommand` over the paired WebSocket, adding a fresh `commandId`. IDs containing `::` (remote buildings) go to `remote-building.cjs` `dispatch()` instead. Every command in `OrchestrationV2Command` needs only `orchestration:operate`, which the app already holds.
- **Other RPCs:** `t3server.cjs` `call(tag, payload)` (line 321). The app's default scopes are `orchestration:read` and `orchestration:operate`; `grantScope()` can add `settings:write` and `providers:manage` only (`EXTRA_SCOPES`, line 34).
- **CLI:** `t3.cjs` `runCli()` for `thread start`, `thread send`, `project add`, `project remove`.
- **Reads:** `t3.cjs` reads `statev2.sqlite` directly (read-only).
- **Renderer bridge:** `preload.cjs` exposes `window.lucid` (CLI and reads) and `window.lucidT3` (paired session, `t3s:*` handlers in `main.cjs` lines 518 to 549).

The scopes the app has never asked for matter for the larger gaps: `terminal:operate`/`terminal:read`, `source-control:write`, `filesystem:read`/`filesystem:write`, `preview:operate`, `diagnostics:read`.

## Threads

| Feature | T3 offers | The app has | Missing | Effort |
|---|---|---|---|---|
| Create | `orchestration.launchThread` (title, `modelSelection`, `runtimeMode`, `interactionMode`, `workspaceStrategy`, `initialMessage`) | `hire.ts`, `t3server.cjs` `startHire` (line 530), `hire-runtime.cjs` `launchPayload`; CLI fallback `t3.cjs` `startThread` | Launch always uses `workspaceStrategy: {type:"root"}`, `interactionMode: "default"`, `attachments: []` | covered (see Worktrees, Plan mode, Attachments) |
| Send / follow-up | `message.dispatch` with `dispatchMode` (`start_immediately`, `queue_after_active`, `steer_active`, `restart_active`) | `chat-panel.ts` send (around line 596) via CLI `t3 thread send`; remote path uses `message.dispatch` (`remote-building.cjs` line 91) | Explicit "steer now" and "restart with this message" when sending (only queued messages can be promoted to steer) | S |
| Queue edit / reorder / cancel / steer | `queued-run.edit`, `queued-run.reorder`, `queued-run.cancel`, `queued-message.promote-to-steer` | `t3server.cjs` lines 349 to 355, `chat-panel.ts` queue UI (lines 1597 to 1796) | Nothing | done |
| Resume held queue | `queue.resume`, `queued-run.start` | none | Button after a stop (Stop holds the queue) | S |
| **Stop / interrupt** | `thread.stop` (web client uses it when `capabilities.threadStop`, which the local server sets); fallback `run.interrupt` with `runId`, `holdQueue: true`; `orchestration.forceStopThread` RPC for runs that ignore Stop; `subagent.stop` | Stop in the chat composer (`chat-panel.ts` `.cp-stop`) and the thread and desk menus, sent as `thread.stop` through `t3s:stop` (`electron/thread-actions.cjs` validates; linked computers get their own dispatch) | Force stop, subagent stop | done (S left) |
| Settle / unsettle | `thread.settle`, `thread.unsettle` | `t3server.cjs` `settleThread` (390), `unsettleThread` (401); `t3s:settle` IPC; reports "Reopen" uses unsettle | `unsettleThread` has no IPC for the sidebar's settled list | S |
| Auto-settle opt out | `thread.auto-settle.set` | none | Per-thread toggle | S |
| **Archive / unarchive** | `thread.archive`, `thread.unarchive`; Settings > Archived lists them (`orchestration.getArchivedShellSnapshot`) | Archive in T3 in the thread and desk menus with a confirm (`t3s:archive`); refused while running and for the orchestrator's thread. The app hides archived threads (`t3.cjs` filters `archived_at is null`) | An archived list with Unarchive and Delete | M list |
| Delete | `thread.delete` (`onlyIfUnused` optional); T3 confirms first | none | Delete with confirm | S |
| **Rename** | `thread.metadata.update` with `title`; `regenerateTitle: true` | Rename row in the thread and desk menus (`t3s:rename`, trimmed, at most 120 characters); automatic regenerate after each run (`title-refresh.cjs`) | A manual "Regenerate title" item | S |
| Pin / reorder | `thread.pin`, `thread.unpin`, `thread.pin.reorder`, `thread.active.reorder` | `main.cjs` `t3s:pin` (523), `t3s:move-thread` (533); `main.ts` `pinItems` (1706) | Nothing | done |
| Snooze | `thread.snooze` (`snoozedUntil`), `thread.unsnooze` | none | Snooze presets (1h, tomorrow) | S |
| Read / unread | `thread.visit` (`visitedAt`, `opened`), `thread.mark-unread` | The app computes `unseen` from `lastVisitedAt` (`t3.cjs` world) but never sends `thread.visit`, so reading in the app leaves T3 unread | Send `thread.visit` on open; "Mark unread" item | S |
| Tags | `thread.tag.set` | none | Tag chips | S (low value) |
| Fork / side chat / merge back | `thread.fork` (`sourcePoint`: latest, run, checkpoint; `sideChat`), `thread.merge_back` | none | Fork from a message, side chat | M |
| Copy reference / id / branch / path | context menu `copy-thread`, `copy-thread-id`, `copy-branch`, `copy-path` | "Reference in chat (R)" | Copy items | S |
| Turn into project | `projects.createFromThread`; `thread.project.adopt-folder` | Freelance desk "Turn this work into a project" (`main.ts` desk menu, via CLI `project add`) | Uses CLI, not the thread link; fine for now | done |
| Guest share | `thread.guest-share.open/close`, `guestShare.create` | none | Out of scope for now | M |

## Models and runtime

| Feature | T3 offers | The app has | Missing | Effort |
|---|---|---|---|---|
| Harness, model, effort, fast mode | `thread.model-selection.set`; options from `server.getConfig` `optionDescriptors` | `chat-panel.ts` model bar (`.cp-model`, setModel line 1418), `t3server.cjs` `setThreadModel` (411), `listProviders` (483); hire runtime controls | Nothing | done |
| Provider switch mid thread | `provider.switch` | via model selection | none | done |
| Access mode | `thread.runtime-mode.set` (`approval-required`, `auto-accept-edits`, `auto`, `full-access`) | Hire uses the project or T3 default (`hire-runtime.cjs` `hireDefaults`) | Picker in hire and chat | S |
| **Plan mode** | `thread.interaction-mode.set` (`default`, `plan`); plans in `orchestration_v2_projection_plans`; "Implement plan" sends `message.dispatch` with `sourcePlanRef` | none | Toggle (S); plan card with Implement (M) | S then M |
| Fresh context | `message.dispatch` `freshContext: true` | none | "Start fresh" send option | S |
| Prompt suggestion | `orchestration.subscribePromptSuggestion` | none | Ghost suggestion in composer | M |

## Workspace, git, review

| Feature | T3 offers | The app has | Missing | Effort |
|---|---|---|---|---|
| Worktrees | launch `workspaceStrategy` `worktree` (`baseRef`, `branch`, `startFromOrigin`) or `existing_worktree`; `vcs.createWorktree`/`vcs.removeWorktree` (source-control:write); Settings > Worktrees | The app shows `folder`/`branch` per thread (`t3.cjs` world), `t3.threadFolders()` | "Where" choice in hire (root or new worktree from a ref); refs from `vcs.listRefs` (orchestration:read) | M |
| Branches | `vcs.listRefs`, `vcs.createRef`, `vcs.switchRef`, `vcs.pull`, `subscribeVcsStatus` | Branch shown in thread list tooltip and search (`main.ts` ~1495); `sites.cjs` `gitInfo` (read-only) | Switch / create branch (needs source-control:write) | M |
| Diffs | `orchestration.getTurnDiff`, `orchestration.getFullThreadDiff` (orchestration:read); `review.getDiffPreview` (filesystem:read) | Work rows list edits (`chat-work.ts`) without content | Diff viewer per turn and per thread (fits the robot's screen) | M |
| Checkpoints / revert | `checkpoint.rollback` (`scopeId`, `checkpointId`, `restoreFiles`); data in `orchestration_v2_projection_checkpoints` | none | "Revert to here" on a turn, with confirm | M |
| Git actions / PRs | `git.runStackedAction`, `pullRequests.*`, `thread.pull-request.link/watch` (source-control:write for writes) | none | Commit, push, open PR, PR status | L |
| Terminal | `terminal.open/attach/write/resize/close`, `subscribeTerminalMetadata` (terminal:operate) | none (`chat-work.ts` shows command lines; `subscribeCommandOutput` not used) | A terminal app on the robot's computer (xterm); live command output is a cheaper first step (M) | L |
| Open in editor / files | `shell.openInEditor` (orchestration:operate), `projects.searchEntries/readFile` (filesystem:read) | `fs:reveal`, `fs:text`, Explorer (`docs/explorer-and-attachments.md`) | Open in editor | S |
| Preview / devices | `preview.*`, `device.*` | The app's own web peek (`web:peek`, `web:shot`) | Out of scope | L |

## Attachments and input

| Feature | T3 offers | The app has | Missing | Effort |
|---|---|---|---|---|
| Attachments | Native `ChatAttachment` on `message.dispatch`; upload via `attachments.createUploadUrl` / `assets.persistChatAttachments` | `chat-panel.ts` saves files to `~/.t3/userdata/lucid-attachments` (`main.cjs` `attach:save`, line 310) and lists paths in the text; hire attachments similar | Real attachments so images reach the model as images and show in T3 | M |
| Dictation | `/api/voice/*` | `t3-voice.cjs`, `src/office/dictation.ts` | Nothing | done |
| Approvals / questions / secrets | `runtime-request.respond` (decision, feedback, answers, `attachmentsByQuestionId`), `thread.user-input.dismiss`, `secrets.answerRequest` | `t3server.cjs` `respondToRequest` (365), `answer.ts`, `delegate.ts` | Dismiss a question without answering; attachments in answers | S |
| Search | `orchestration.searchThreads`, `orchestration.searchThread` (in-thread) | Ctrl+K (`main.ts` ~1448, `t3server.cjs` `searchThreads` 581) | Find in this conversation (`chat.find`) | S to M |

## Projects, environments, account

| Feature | T3 offers | The app has | Missing | Effort |
|---|---|---|---|---|
| Add / create project | `projects.mutate` `project.create`; `projects.createNew`; clone (`sourceControl.cloneRepository`, `projectClone.*`) | `t3.cjs` `addProject` (CLI), `new-project.ts`, `main.cjs` `project:create` | Clone from URL (needs source-control:write) | M |
| Remove / archive / pin project | `project.delete` (`force`), `project.update` (`archived`, `pinned`, title, defaults, scripts, icon) | `t3.cjs` `removeProject` (CLI, never forces) | Rename project, archive project, project default model | S each |
| Environments / linked machines | `peerLinks.*` (WS, `access:read`), the desktop's saved connection catalog (only T3's own window can read it), relay `/v1/environments` and `/status` | Every linked machine is its own campus building with its robots (`environments.cjs`, `remote-building.cjs`, `world.ts` `drawBuildings`); each building shows configured, connected, failed, offline or expired state on its sign and in the sidebar; reads, sends, pins, reorders and dispatches go to that machine (`::` ids) | Catalog decryption works only on Windows (Linux and macOS use the keyring format); bearer and SSH saved connections are ignored; peer links cannot be opened because T3 keeps their access in its own server; starting threads, sending files and settling in remote buildings. A clean fix needs a T3 RPC for saved environments and their live state | M, partly blocked on T3 |
| Usage and limits | `server.getConfig` `usageLimits`; `server.getUsageSummary` (diagnostics:read); `/usage` page | `usage.cjs`, `provider-limits.cjs`, `t3server.cjs` `usageLimits` (461), `limits-section.ts` | Cost and token history (needs diagnostics:read) | M |
| Reset credits | `provider.consumeResetCredit` (providers:manage) | `t3server.cjs` `consumeResetCredit` (450), `main.ts` ~1284 | Nothing | done |
| Provider sign-in / install | `provider.auth.*`, `provider.install.*` | none | Leave to T3, link out | L |
| Scheduled tasks | `scheduledTasks.*` | Schedule shown per thread (`t3.cjs` world reads `scheduled_tasks`) | Create, pause, run now | M |
| Settings | `server.updateSettings` (settings:write, more scopes for some keys), Settings pages (general, chat, threads, worktrees, diffs, voice, keybindings, providers, appearance and more) | The app's own settings (`settings:load/save`); reads T3 defaults via `server.getConfig` | Edit the T3 settings that matter in the app (default model, runtime mode, worktree mode) | M |
| Themes | Theme picker, editor; stored in T3's Local Storage | Follow T3 theme read-only (`t3-theme.cjs`, `docs/themes.md`) plus its own themes | Nothing needed | done |
| Keyboard shortcuts | ~70 commands (`thread.stop`, `thread.settle`, `thread.pin`, `chat.new`, `composer.mode`, `diff.toggle`, `terminal.toggle`, ...) and `server.upsertKeybinding` | `shortcuts.ts` (Ctrl+N, Ctrl+K, Ctrl+J, Ctrl+B, Esc, Enter, ?), Alt+Up/Down reorder, R reference | Stop, settle, pin, plan-mode keys once those actions exist | S |
| Notifications | Desktop notifications for finished runs and requests (`OrchestrationV2Notification`) | In-world cues, sounds, Ctrl+J "next thread that needs you"; no OS notifications | OS notification when a thread needs you or finishes while the app is unfocused | S |
| Storage / diagnostics / updates | `server.runStorageCleanup`, diagnostics, `server.updateServer` | The app's own updater | Leave to T3 | n/a |

## Recommended order

1. **Stop** is done (chat composer and menus). Next: **Resume queue** (`queue.resume`) after a stop, and Force stop for runs that ignore Stop.
2. **Rename** and **Archive** are done in the thread and desk menus. Next: **Delete** with a confirm, then the archived list.
3. **Mark read** (`thread.visit` on open) and **Mark unread**, so T3 and the app agree on unread state.
4. **Unsettle** from the settled list, **Snooze**, **Auto-settle** toggle, copy id/branch.
5. **Access mode** and **Plan mode** toggles in hire and chat; then the plan card with Implement.
6. **OS notifications** for questions and finished work.
7. **Native attachments**.
8. **Worktree choice** in hire (`workspaceStrategy`), then **diff viewer** (`getTurnDiff`), then **checkpoint revert**.
9. **Archived list**, project rename/archive, scheduled tasks, T3 settings subset.
10. **Terminal**, git and PR actions, provider sign-in: only if the user still opens T3 for them.
