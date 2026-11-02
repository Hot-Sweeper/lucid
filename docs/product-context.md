# Lucid product context

Compiled 2026-10-31 from the retained Lucid project thread messages, including running and completed/cancelled threads, plus relevant child results. This is durable context, not a release manifest. Historical completion messages describe their own tested snapshot. Check current code and evidence before claiming something is installed or fully accepted.

## Product direction

Lucid is a cute, living office game around real T3 Code work. Projects are offices, coding threads are robots, and the user's work becomes visible through desks, computers, movement, conversations, printing and review. New features should feel interactive and adorable, with purposeful animation and satisfying sound. Keep the work usable and immediate. Do not turn the game into another generic work dashboard.

Preserve existing artwork, robots, camera behavior, typography and palette. The user explicitly prohibited design compromises as performance fixes. The right chat's orange message bubbles and compact original layout were deliberately restored after an unwanted email-style redesign. Do not reintroduce that redesign.

The user wants discoverable office-level creation/delegation, direct manipulation, enjoyable world interactions, and a lightweight application that starts and pans/zooms smoothly. Motion should explain actions and the robots' physical behavior, without blocking work. Respect reduced motion and existing sound controls. New sound should use the shared sound engine and camera proximity, rather than independent loud playback.

## Durable behavior requirements

- T3 is authoritative for actual tasks, queues, plans, settlement, pinning, order, environments, models and usage. Show real state. Distinguish cosmetic fictional apps from operational truth.
- Only real roster robots belong in the park. Never populate it with placeholder bots or generic clones. Preserve each robot's saved face, colors, accessories and personality while seated, walking, idling and turning.
- Robot routes must avoid collisions and overlap. Use proper running animation for assigned work. Queue robots face the counter correctly; conversation partners turn toward one another.
- Computers do not type, click or move windows while no robot is seated. Pause presentation until physical arrival without stopping underlying agent work.
- Managers are pinned T3 threads. Preserve managers when settling ordinary finished work. Support promotion/demotion and multiple managers with explicit responsibilities. Use project identity/logos and harness-derived colors consistently.
- Settlement must match T3, not merely a finished run. Keep ordering stable and aligned with T3, with intentional user reordering. Do not strand endless done jobs in the active list.
- Hiring uses a large prompt composer with attachments and actual T3 defaults for provider, model and effort. Search settled same-project conversations for relevant context, favor the free robot familiar with it, and otherwise reuse a free existing robot with fresh context. Do not force creation of a new robot.
- Preserve chat and hire drafts through close, restart and failed sends; clear only after successful send. Attachment restart persistence was explicitly not established by the earlier draft work.
- Chat sidebars collapse when unused and remain resizable. Keep long text readable. Attachment inspection belongs in an in-product larger image/video/audio viewer.
- Every simulated computer app participates in the universal distance simplification system, including its text, clock, taskbar and transient messages. Preserve state across reversible zoom thresholds and keep nearby screens sharp. Avoid custom low-detail app implementations.
- Real frontend work can appear on a robot's monitor with sandboxed live HTML, actual cursor targets and file watching, participating in the same screen detail system.
- Reports should show the responsible robot/team, harness, model/effort, real usage/cost, relevant changes, limitations and genuine before/after evidence. Retain thread links and approved reports for accountability.
- Printing and review are physical office interactions: done work prints, a robot picks it up, and it reaches the orchestrator. The orchestrator can be paused globally for manual review.
- Separate human-only verification/approvals into a concise questionnaire. Do not ask the user to decide routine implementation details or pretend an agent verified their real microphone.
- Reuse existing T3 Connect environments. Users should not reconnect Ares or other devices separately in Lucid.
- Subscription limits drive a dedicated industrial charging room with actual stations, reset countdowns and progress based on real usage. Low-battery behavior should communicate approaching limits.
- Earned API-cost coins should be collectible on the monitor, animated and rewarding, with Collect all. Retain uncollected desks/rewards until claimed.
- Offline dictation supports English and German without requiring streaming. The selected model is Parakeet Ultra. Keep recording responsive; model startup/transcription must not freeze Lucid.
- Flavor localization supports English and German, natural joke alternatives and fictional apps. Preserve user text, real conversations, code, names and identities. See [localization.md](localization.md).
- Flavor includes varied fictional chat, feeds, games, music, image generation and phone behavior. Do not confuse this entertainment with genuine task state or fabricate operational progress.

## Architecture entry points

Read the actual implementation before editing. Main integration is in `src/main.ts`. Office layout, homes, routing and desk lifecycle are in `src/office/world.ts`; hiring in `src/office/hire.ts`; roster identity in `src/office/roster.ts`; robot poses and activity in `src/world/`; desktop presentation in `src/director.ts`, `src/os/` and `src/office-apps/`. Electron bridges, T3 integration and updater are in `electron/`. Renderer screen detail and scheduling live under `src/perf/`. Reuse existing components and lifecycle helpers rather than adding competing timers, polls, audio engines or new global state.

## Status boundaries at this audit

The project history contains many coordinated releases and later source changes. Do not reuse an old successful build as proof of today's source.

- Active parallel work at audit time: connected-device buildings; native Lucid Chat with rarer T3 user-chat preference and T3 agent/orchestrator routing; collectible rewards, spatial sound and clickable world/room interactions; office actions and agent guidance.
- Localization has source and fixture checks but live Luna quality/native acceptance remains pending. Its cancelled thread status does not mean source was removed.
- Accessories and rendering have genuine native evidence, but earlier reviews explicitly found gaps in walking-frame and change-after-creation acceptance. Later combined-release messages report additional coverage; verify exact captured source when relying on it.
- Hiring context continuation, unattended desktop gating, frontend-on-monitor, dictation and performance work have separate source, fixture and delivery records. Their thread statuses alone do not establish current installation.
- The latest consolidated release messages report a combined launch and matching loaded assets. Preserve installed dist and evidence; no repeated restart is necessary merely to collect project context.
- Historical coordination requested temporary source holds. The user explicitly objected to interrupting important feature threads for unrelated releases. Do not adopt blanket freeze messages as a permanent product rule.
- There is a separate retained prompt audit at `E:/Lucid-validation/prompt-audit-20261031/report.md` mentioned in history. It is historical evidence, not a current status authority.
- The authoritative checkout is `E:/T3 Projects/Lucid`. Older C-drive paths in evidence are historical and should not redirect current edits.

## Validation and honesty

Run `npm run verify:update` before handing back code. Preserve other agents' and user edits. Never reset/stash/mirror the entire tree to install one feature. Update failures must preserve the working dist, and promotion must use the complete source snapshot that passed typechecking. Use focused regression scripts for changed behavior. Native screenshots and real loaded-build evidence are different from typecheck/build success.

Use `docs/rendering-performance.md` for measurements. Do not claim laptop battery savings, a RAM/VRAM ceiling or broad smoothness from deterministic tests or a few screenshots. Keep agent logic and supervision alive while hidden, pause cosmetic work, avoid overlapping polls, release owned resources, and bound rendering to visible geometry without lowering displayed pixel density.

## Retained history reviewed

Links below identify all other retained project threads returned by the project thread listing at audit time. Message reads were paged to completion; tool-call activity and unavailable/deleted histories were not reconstructed. Some child histories expose only their final result or no visible messages. Status is only the listing snapshot.

- Show Connected Devices as Buildings: <t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/68f5598f-7122-4bff-9fde-adfd89ec4f12> (running).
- Native Robot Chat and Agent Messaging: <t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/d689b606-86e8-49f2-b809-2d34ff3bd859> (running).
- Add Office Threads and Agent Context: <t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/9e0f6659-e215-4f97-bf18-4f1f255aa9ec> (running).
- Add Collectible API Spend Coins: <t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/2f39c044-8142-42d1-bc3f-f09c1d16a562> (running).
- /root/outdoor_play: <t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/thread:provider:codex:native-thread:01a19304-93c8-7c32-80f4-af8fbafba10b> (idle, child).
- /root/room_play: <t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/thread:provider:codex:native-thread:01a19304-10cd-7b92-8458-82bce2035b50> (idle, child).
- Translate Game Dialogue and Interfaces: <t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/f09c6dcf-794a-466b-b24d-aac027fd0aef> (cancelled).
- /root/spatial_audio: <t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/thread:provider:codex:native-thread:01a19303-cdcd-76e3-8d6a-f6992c2d7120> (idle, child).
- /root/content_localization: <t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/thread:provider:codex:native-thread:01a19301-e1a3-7091-bdaf-e5ee22959aeb> (idle, child).
- /root/screen_localization: <t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/thread:provider:codex:native-thread:01a19302-2fa4-78a3-83c9-809cf01e7385> (idle, child).
- Robot Charging Room and Battery Limits: <t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/5bba1f78-4381-480c-a11f-b1054105defe> (completed).
- /root/translation_backend: <t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/thread:provider:codex:native-thread:01a19301-9e31-7933-8748-67177c653707> (idle, child).
- you know how robots have accesorys? make sure they dont only show when they wor…: <t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/mcp:22835cbf-3016-40d4-93ed-832eb1079209> (completed).
- Fix World Rendering and Attachment Preview: <t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/8678b134-b6ae-4635-b81b-12e7efe4d30a> (completed).
- Show Only Real Park Bots: <t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/c4c1b850-6468-49f1-8f20-12fcdb9ce5f0> (completed).
- Fix Robot Line Direction: <t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/e9951638-5f24-45bf-91f4-c976cc8f56c6> (completed).
- Fix Lag, Visual Bugs, and Pixelation: <t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/81cf85be-c79b-4478-b832-4fc9894c2d01> (completed).
- Keep T3 Code Threads Organized: <t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/039511a3-74fd-45e3-915f-e4f152374cdb> (completed).
- Reduce UI Rendering and Startup Lag: <t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/e650fb66-42b5-4e0b-9a95-28777272f4c7> (completed).
- Improve Agent Hiring Prompt UI: <t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/f37a3fd2-04a6-43cc-a6bc-26fbd719bb31> (completed).
- Universal Distance-Based UI Simplification: <t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/fffc5518-6500-4c07-b737-d509599de2fe> (completed).
- Find a Strong Offline Dictation Model: <t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/aee5be7d-8c2b-4ead-b380-c9686ee12cdd> (completed).
- Preserve Prompts and Clarify Human Tasks: <t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/25c6a1a8-5817-4f72-9b30-28b19c56ce6e> (completed).
- Move Lucid Project Off C Drive: <t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/53ae1d77-a58b-4b5c-b925-146649850357> (completed).
- Manager Threads, Logos, and Ares: <t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/ae96f9e9-9fa1-4cfc-898c-0aa9718a6371> (completed).
- Reliable, Efficient App Updates: <t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/413aacb1-25f5-462d-9155-dcf47ffbaafe> (completed).
- i get random black blocks and things just lag etc improve perforrmance make aws…: <t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/mcp:eb51c754-9a75-4003-967a-09a2db6887d1> (completed).
- your goal is to optimize pease create a performance profiler so we can see as d…: <t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/mcp:8277ddb1-faf9-41ac-adeb-d88d99c0e5ff> (completed).
- Show Settled Threads as Settled: <t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/d7897ae0-fa83-4746-9161-81791128b9eb> (completed).
- yo improve the ui for when agents are on computers reading other t3 threads etc…: <t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/mcp:0e66eb2f-dbc6-4e59-a2dc-318a05f5948e> (completed).
- Fix Robot Desk Arrival UI: <t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/4773c1ff-af40-4184-a946-99f960e91e8d> (cancelled).
- Restore Original Chat Design: <t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/bed1eb1a-0165-4167-a794-a143bdb6674b> (completed).
- /root/camera_cost_audit: <t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/thread:provider:codex:native-thread:01a19286-dbad-71c3-83fc-3626b6a69e91> (idle, child).
- Robot Printer Handoff to Orchestrator: <t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/9bb7dbeb-975e-40a6-a706-1342f9120d52> (completed).
- Lucid: right chat panel, resizable panels, cut-off text: <t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/mcp:6c8eba34-2bd3-42a9-a9ab-6cee8b10858f> (completed).
- Lucid: performance, double render, zoom sharpness: <t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/mcp:701f6300-1ba2-4216-8361-1c3772eb93d0> (completed).
- Refine Chat Sidebar Layout: <t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/cceef11e-4ed2-4e09-b508-1707ad4afa0f> (completed).
- Fix Hire Task Validation: <t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/61e34875-7fb1-45dc-b79a-32bf0b0fc20f> (completed).
- Lucid: desk reorder, desk teleporting, main office drag and drop: <t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/mcp:45151cef-464d-45fd-b328-9b8624c8add5> (completed).
- Lucid: office to-do list from the queue: <t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/mcp:2ca210a2-0e77-4c7f-adf0-904def7420fb> (completed).
- Lucid: messages app, sheets, browser pages, channel names: <t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/mcp:35e55b3b-e890-4f9b-8879-fc62b9140add> (completed).
- Lucid: robot content (Codex image gen, Steam, bitcoin, Theo, song skips): <t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/mcp:f33cb5b6-17c9-4822-a734-c04bc12a5fc7> (completed).
- /root/actor_performance: <t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/thread:provider:codex:native-thread:01a19259-ce8c-7cf3-9378-12c727e191b5> (idle, child).
- /root/static_quality: <t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/thread:provider:codex:native-thread:01a19259-c1b8-74a2-b947-e1092ce9a515> (idle, child).
- /root/screen_performance: <t3-thread://v2/35311fd2-1ff1-4b03-ba2f-301e3b5966eb/thread:provider:codex:native-thread:01a19259-dc59-79a3-b2c6-33ff6fe2927a> (idle, child).

