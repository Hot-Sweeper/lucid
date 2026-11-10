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

## Pinned threads

A thread pinned in T3 is listed first and its robot keeps its desk, with a small pin sticker on
it. Pin or unpin a thread from its desk menu or its row's context menu; this uses T3's own pin,
so T3 shows the same state.

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

## Keep computers in sync

`npm install` enables this repository's Git hook, which pushes each new commit
to GitHub automatically. Commit changes before switching computers. If a push
fails while offline, the commit stays safe locally; run `git push` after reconnecting.
Existing custom Git hooks are preserved and chained. The installer configures all
existing worktrees using a helper in Git's shared local storage, so older branches
do not need the new scripts. Run `node scripts/setup-git-sync.cjs` again after adding
a worktree. Fresh clones are configured by `npm install`.

On the other computer, run `git pull --ff-only` before starting work, then
`npm install` if dependencies changed. Uncommitted edits remain local. Automatic
pushing does not merge changes or overwrite another computer's work.

## Develop

```sh
npm run dev        # Vite dev server + Electron with live reload of the renderer
npm run typecheck
npm run build
npm run dev:playgrounds   # isolated pages for single parts of the office (dev/)
```

Builds and `npm run verify:update` write to `dist-build`, keeping the installed
`dist` intact while Lucid is running. Use Lucid's update button to validate and
install changes. Do not build directly into the shared checkout's `dist`.

## Dictation

Dictation uses T3 Code's own speech service, so it needs a T3 Code version with
dictation. The first time you click **Dictate** without a speech model in T3, the
chat offers to download the model T3 has selected and shows T3's real download
progress. The model is shared: T3 uses it too, and models you install in T3's
settings work here. Your recognition preferences (language, custom words, filler
word removal) are the ones you set in T3.

In a robot's chat, click **Dictate**, speak, then click **Stop**. The transcript is
inserted at the cursor in your draft. Review and send it yourself. Escape, switching
threads, or closing the chat cancels dictation. Audio goes only to the T3 Code server
on this computer, which transcribes it with the local model. It is not saved, and
T3's optional cloud speech providers are not used.

`node scripts/verify-dictation.cjs` checks T3's request format, error handling,
first-use download progress and the composer without a microphone or T3.

## How it reads T3 Code

T3 Code stores every agent action in `~/.t3/userdata/statev2.sqlite`. Lucid opens that file **read-only** and polls it for new or changed events in the selected thread (`electron/t3.cjs`). Starting threads and sending messages go through T3's own `t3` CLI. Lucid never writes to T3's database.

This uses T3 Code's internal storage, which can change between T3 versions. The reader is kept in one file so it is easy to adjust.

## Layout

- `electron/` main process: T3 reader, CLI bridge, page and image fetching, updater.
- `src/stage.ts` the room, desk, monitor, wall notes, bubbles and camera.
- `src/robot.ts` the robot: vector shapes, two-bone arms, GSAP poses.
- `src/os/` the robot's desktop: window manager, cursor, dock and apps.
- `src/director.ts` turns T3 events into scenes, one at a time, speeding up when work piles up.
- `src/studio/` the website build playback engine, kept for robots that build sites on their screens.
- `dev/` dev playgrounds with one Vite config and an index page.
