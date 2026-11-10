# Session checks

Before changing the interface, read `C:/Users/tim/.agents/skills/things-i-hate/SKILL.md` and preserve Lucid's visual language. Do not use em or en dashes as sentence punctuation.

Before handing back code changes, run `npm run verify:update`. This checks TypeScript, update recovery and promotion, screen scheduling, detail transitions, viewport allocation, and a production build. Fix failures before declaring an update ready. Do not bypass typechecking to make an update install.

Updates must preserve the working dist on failure, preserve user edits, accept only fast-forward remote changes, and promote only a complete build of the same source snapshot that passed typechecking. Test interrupted validation and retry when modifying the updater. Do not reset or stash user changes automatically.

Ordinary `npm run build` and `npm run verify:update` write `dist-build`, never the installed `dist`. Inspect that candidate output for validation. Only the coordinated updater may replace `dist`. Do not use `--outDir dist` in the shared checkout, because the running app may still need its loaded assets and lazy chunks. The updater explicitly builds `dist-update` inside its private source snapshot.

Keep app logic and agent supervision running when hidden. Pause cosmetic rendering and optional background checks. Prevent overlapping polls. Preserve displayed pixel density and existing artwork, and bound canvas allocations to visible geometry. Release timers, observers and graphics resources when their owners are destroyed. Avoid arbitrary GPU switches or quality reductions as performance fixes.

Use `docs/rendering-performance.md` for the existing profiling procedure. Report measured CPU, RAM, GPU memory and battery results only when actually measured, with hardware and workload. Passing deterministic rendering tests does not establish laptop battery savings or a memory ceiling.

# Product identity and feature expectations

Lucid is a cute, living desktop office for real AI coding work, driven by T3 Code projects and threads. It should feel like a small inhabited game where robots have persistent identities, expressive behavior, physical desks and useful computers. It must remain a practical place to start tasks, supervise agents, answer questions and read conversations.

Read `docs/product-context.md` for the retained project history and requirements. That document distinguishes established decisions from work still in progress. Recheck current code before relying on a historical implementation claim. Other agents may be editing this shared checkout: inspect the working tree and preserve their changes.

For each feature, design the interaction, animation and appropriate sound together. Add cute, purposeful reactions through the existing robot, prop and room systems: a robot arriving at its desk, a paper handoff, a responsive object, a short panel transition. Include fitting SFX for meaningful user actions and physical events. Do not add constant noise or unrelated decorative animation. Feedback must follow real events, respond immediately and never delay a task. Honor reduced motion, global mute and volume, gesture-based audio unlocking, visibility suspension and resource cleanup.

Preserve the existing artwork, robot proportions, provider palettes, warm rooms, navy/lavender panels, peach actions, Lexend UI and JetBrains Mono code typography. Do not redesign existing chat or replace rich artwork with simplistic placeholders. Avoid emojis, decorative status pills, eyebrow labels, generic dashboard cards and ornamental live indicators. Read the full preference skill before interface work.

# Architecture and implementation map

- `src/main.ts`: application coordination, settings, menus, refresh, hiring and thread actions.
- `src/office/world.ts`: rooms, camera, desks, world geometry and interaction callbacks. `room-policy.ts` owns desk eligibility and saved seat projection.
- `src/office/hire.ts`: task composer, supported provider/model/options, roles, attachments, context matching and reusable robots. Reuse this launch flow for office actions. A delegated task here assigns work to a selected robot; do not silently misrepresent a new top-level thread as a native T3 child delegate.
- `src/office/roster.ts` and `src/world/`: persistent robot identity, outfits, movement and shared-room activities. Accessories must appear in every pose and location, not only at a desk.
- `src/office/chat-panel.ts`, `src/harness/`, `src/director.ts`: real conversation presentation, activity and computer behavior. Preserve the established bubble chat design and readable, resizable panels.
- `src/office/sound.ts`: singleton `gameSound`. Reuse its UI cues and spatial emitters, shared graph, rate limits and voice bounds. Do not create a separate audio engine per feature.
- `src/perf/`: rendering scheduling and visibility. Use owned GSAP tweens and release them on teardown.
- `electron/preload.cjs` and `electron/`: privileged bridge, T3 integration, environments, hiring, orchestration, reporting, localization, usage and safe updates. Validate actions at the backend as well as in the UI.

# Durable behavior contracts

Real T3 data is authoritative for work, questions, progress, thread ordering, settlement and usage. Fictional leisure and computer content can be playful, but must never invent operational facts. Only actual roster robots belong in the world. Keep each robot's saved look, identity, work history and home across refresh, walking, charging, leisure and reassignment.

Project offices use `p:<projectId>`. Main-office assignments and freelancer scratch work have different scope. Starting work from a project office must target that project. Main-office launches require a project choice. Preserve saved seat reservations and avoid occupying a busy desk. Quiet offices can fold without deleting reservations or history. A thread pinned in T3 is an ordinary robot that keeps its desk, shows a pin sticker and is listed first.

Preserve drafts, attachments, selected runtime settings and entered answers across errors and reopening. Failed submission must leave a useful retry path. Prevent duplicate starts through the existing request ID mechanism. Recheck a reusable robot's availability before assigning work. Keep launch, room assignment and displayed thread state consistent.

Keep linked environments isolated: displayed data and actions must use the same authenticated environment. Do not send a remote action through the local default. Distinguish configured connections from live authenticated links. Never expose secrets in logs, documentation or the renderer.

Localize fictional dialogue and flavor interfaces through the existing localization system. Preserve user messages, actual agent replies, code, paths, brand names and robot names. See `docs/localization.md`.

# Validation and handoff

Run focused checks for changed behavior and always `npm run verify:update` before handing back code. Do not claim a native visual check, audio listening test, performance measurement or live integration test unless it was performed. Check keyboard access, focus restoration, narrow layouts, long text, loading, failed requests, stale asynchronous responses and repeated actions where affected.

Robots are permanent workers and desks are jobs. Follow `docs/workers-and-desks.md` for hiring, fixed desk places, the review and collect lifecycle, and planned worker features.

Further references: `docs/renderer-structure.md`, `docs/camera-and-office-layout.md`, `docs/screen-fidelity.md`, `docs/request-completion.md` and `docs/rendering-performance.md`.

# Lucid completion skill

For work in this repository, read `electron/skills/lucid/SKILL.md`. Include real screenshots of working visual results in the final report, using labeled Markdown images with stable absolute paths. Explain checks and remaining limitations honestly. Lucid also supplies this skill to jobs launched through its hiring flow, across harnesses.
