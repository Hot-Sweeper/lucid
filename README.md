# Lucid

A desktop app where AI coding agents are robots in an office. Each robot sits at a desk and works on its own computer, and what you see on that computer is real: the folders it browses, the files it reads, the code it types, the commands it runs, the pages it visits and the messages it writes to you.

Lucid runs on top of [T3 Code](https://t3.codes). T3 Code drives the harnesses (Codex, Claude, and others); Lucid reads what they do and turns it into the scene.

## What works in v0

- One robot at one desk, following one T3 Code thread live, or replaying the latest turn of an older thread.
- The robot's desktop has its own apps: Files, Code, Terminal, Browser, Messages and Tools. Commands are turned into what a person would do: listing a folder opens Files and digs in, a search types into the search box and shows the real matches, reading a file opens it in the editor and scrolls through it, edits are typed out line by line.
- Codex robots and Claude robots look different and use the real brand logos.
- Plans (todo lists) appear as sticky notes on the wall and get ticked off.
- Thinking shows as a thought bubble with the agent's real reasoning summary. Questions for you make the robot turn around.
- Start a new Codex task, or reply to the current thread, from the side panel.
- "Look at the screen" (or double-click the monitor) zooms into the robot's computer. Escape zooms back out.
- One-click update: when this git checkout is behind its remote, an Update button appears. It pulls, reinstalls, rebuilds and restarts.

## Requirements

- Windows, macOS or Linux with [Node.js](https://nodejs.org) 20 or newer and Git.
- T3 Code installed and opened at least once (Lucid reads `~/.t3`, or `T3CODE_HOME` if set).

## Install

```sh
git clone https://github.com/Hot-Sweeper/lucid.git
cd lucid
npm install
npm start
```

On Windows you can double-click `Lucid.cmd` after installing.

## Develop

```sh
npm run dev        # Vite dev server + Electron with live reload of the renderer
npm run typecheck
npm run build
```

## Offline dictation (Windows setup)

Run `Setup Dictation.cmd` once with Python installed. It installs an isolated
transcribe.cpp runtime and downloads the checksum-verified Parakeet Ultra Q8 model
to `%LOCALAPPDATA%\Lucid\dictation` (about 740 MB for the model).

In a robot's chat, click **Dictate**, speak English or German, then click **Stop**.
The transcript is inserted at the cursor in your draft. Review and send it yourself.
Escape, switching threads, or closing the chat cancels dictation. Recognition runs
locally, with automatic GPU selection and a CPU fallback. The worker unloads after
five minutes of inactivity. Audio is not saved or sent to a service.

For a separate microphone trial, open `Test Dictation.cmd`, click **Record**, then
click
**Stop and transcribe**. The test starts in CPU mode. The device selector can also
try automatic GPU acceleration. After setup, recognition runs offline. The model
stays loaded while the test window is open; closing it releases the worker.

This is a separate microphone trial. Text is editable and can be copied, but is
not automatically sent to a robot. Recordings and transcripts are not saved by
the trial. See `scripts/dictation-test/NOTICE.txt` for model attribution.

`node scripts/verify-dictation.cjs` runs protocol and composer regressions without
starting Electron, a microphone, or a native speech runtime. It requires Python
to check German text under a Windows legacy output encoding.

## How it reads T3 Code

T3 Code stores every agent action in `~/.t3/userdata/statev2.sqlite`. Lucid opens that file **read-only** and polls it for new or changed events in the selected thread (`electron/t3.cjs`). Starting threads and sending messages go through T3's own `t3` CLI. Lucid never writes to T3's database.

This uses T3 Code's internal storage, which can change between T3 versions. The reader is kept in one file so it is easy to adjust.

## Layout

- `electron/` main process: T3 reader, CLI bridge, page and image fetching, updater.
- `src/stage.ts` the room, desk, monitor, wall notes, bubbles and camera.
- `src/robot.ts` the robot: vector shapes, two-bone arms, GSAP poses.
- `src/os/` the robot's desktop: window manager, cursor, dock and apps.
- `src/director.ts` turns T3 events into scenes, one at a time, speeding up when work piles up.
