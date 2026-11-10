# Workers and desks

Settled with the user on 2026-11-03. This is the model every robot, desk and thread feature follows. All parts below are built; the evidence section says what was checked.

## Session continuity, Linux update 2026-11-06

A finished turn leaves its unsettled session at the same reserved desk, including after
restarting the app. Idle, interrupted and failed sessions remain available for continuation.
Only explicit settlement releases that place. The completion monitor offers Continue
session and Settle & collect; the coin tray names its settlement effect too. Continuing
starts another turn on the same T3 thread and keeps earned coins pending. Running work
and pending questions cannot collect a reward; successful settlement precedes payout.
Review approval remains required when review is enabled. Settled history remains readable.
This replaces the earlier rule that quiet uncollected jobs relinquish their desks.

## The model in one sentence

A robot is a permanent **worker**. A desk is one **job**, which is one T3 thread. You find work by its desk, not by its robot.

## Workers

- A worker keeps the same name, look, accessories, persona, preferences and history for life.
- A worker's **setup** is a harness and a model. Reasoning effort and speed are chosen per job and do not define a worker.
- Hiring and automatic assignment share one rule, `compatibleWorkers` in `src/office/worker-match.ts`: the harness must match; a known model must match exactly; an unknown model on either side cannot contradict the other (a thread whose model is not reported yet may use a free worker of that harness, preferring one with no recorded model; a worker hired before models were tracked may take its first model). Exact matches come first, then experience. No compatible free worker means a new hire.
- Workers are shared across offices.
- **Retrain** (focus view) changes a free worker's harness and model. Shape, name, persona and history stay.
- **Retire** (focus view) moves a free worker to the staff wall. Nothing is deleted; the staff wall can rehire it. Retired workers are never assigned or shown in the break room. The staff wall leads with the robot of the month (most approved reports this month).
- You do not chat with a robot. Clicking a desk or its robot opens that job's thread.

## Hiring

1. Click an empty desk. The composer has prompt, attachments, harness, model, thinking and speed, plus an optional role.
2. It shows the full-body worker who will take the job, as the real walking robot: a free worker with that setup (arrows choose among several), or a new hire whose previewed look it keeps. Availability is rechecked right before starting.
3. **Hire** starts a new thread. The worker sprints to exactly that desk.
4. No context matching. A new thread is always a new thread.

## Desk places

Desk k in a room is reservation k (`src/office/room-policy.ts`). The places follow a snake: the first row goes left to right, the second right to left, and subsequent rows alternate. Removing a desk closes its gap by shifting every later workstation forward in the same order, including running work, questions and pinned threads. Existing desk objects, sessions, reports and drafts stay mounted. A launch that has only a temporary reservation holds compaction until its thread is known. Room capacity trims at the empty tail; deliberate extra capacity remains available. Placement, drag targets, the Add a desk placeholder and decoration footprints share the same snake coordinates.

### Adding a desk

Desks are real furniture only. `projectRoomSeats` makes one physical desk per reservation up to the last occupied one, plus the spare desks added by hand (`extra`). The rest of a partly filled row is bare floor, not a vacant desk.

An open office shows exactly one faint ghost desk, the Add a desk placeholder, when every desk in it is taken (`addDeskPlace` in `src/office/room-policy.ts`). It stands at the next place of the snake:

- An empty office shows it at place 0, so the first desk can always be added.
- In a partly filled row it takes the free spot right after the last desk.
- When the last row is full, the snake turns: the placeholder stands directly below the row's last desk (at the right end after a left to right row, at the left end after a right to left row), and the room is sized to hold that row.

A vacant desk already offers a place to start work, so no placeholder appears while one exists, and folded offices show none. The floor reserves the placeholder's place like a desk: decorations keep clear of it, walkers route around it, and adding through it does not resize the room. Width changes move it with the snake.

Pressing it (click, Enter or Space) runs the same add path as before (`world.onAddDesk` in `src/main.ts`): it keeps the saved layout and reservations and uses the safe floor-plan transition. The new vacant desk assembles where the ghost stood (the desk top drops in, the monitor rises, about 370 ms) with the shared `build` cue. Repeat presses are ignored until that desk stands. Reduced motion shows the desk at once; the cue still plays.


## Job lifecycle

1. Working: the worker sits at the desk.
2. Done: it prints its report, carries it to the orchestrator and waits in the line. Its desk keeps its place with an empty chair (`reviewPending`). No completion screen appears.
3. Review by the AI orchestrator, or by you from its chair (both review modes queue the robot).
   - **Follow up** sends your note to the same thread; the worker goes back to work.
   - **Approve** records "approved, ready to collect" (`electron/reports.cjs`). It does not settle. The worker returns to its desk.
4. The desk screen shows the job title, the review summary and one **Collect** button.
5. Collect settles the thread through the review (`reports.manual(id, 'collect')`), pays the coins, which fly to the counter and clink as each lands while the balance counts up, and clears the desk. If T3 is slow, the collect intent is saved and finishes on recovery.
6. Without an orchestrator, work finished while the app is open shows Collect directly and settles through `t3s:settle`.
7. The coin tray's Collect all only offers collectible work and also clears those desks.

## Pinned threads

A thread pinned in T3 is an ordinary robot that keeps its desk and is never collected. Its desk carries a small pin sticker, and the thread list shows it first. The desk menu and the thread row menu pin or unpin it through T3's own pin.

## Focus view and staff wall

A second click on a robot (walking, or seated at a focused desk) opens `src/office/worker-focus.ts`: the robot floats over a backdrop tinted by its harness, with setup, current job, record, written persona and recent approved work, and Open chat, Customize, Retrain and Retire. The desk menu has Worker profile; Office & tools has Staff wall.

## Orchestrator

Optional and off until you set it up (top bar Set up, or the sidebar section). Setup (`src/office/orchestrator-setup.ts`) says what it is, where its notes live and that every review, answer and learning batch is a turn on the chosen model; the harness and model come from T3's own list and are validated again in the main process (`electron/orchestrator-ipc.cjs`). It is one pinned T3 thread launched with a request id, so a retry cannot start a second one.

- Folder: `~/T3 Projects/<brand name> Orchestrator` (`orchestrator.cjs folderName`). An older folder (for example `Lucid Orchestrator`) moves there in one atomic rename, so `memory.md`, `answers.json` and `reports/` move together or not at all; when the rename fails or the target already exists nothing moves. T3's project is repointed with `project.meta.update` and retried until T3 accepts. No personal notes are read to seed its memory.
- On/off: the top bar switch. Off holds every new automatic review, answer and learning batch; your own reviews, collects and settlement recovery keep working.
- Strict: approval needs the original request, a final result, actual checks and, for visual work, captured before and after images. Human-only checks go to a questionnaire of at most three yes/no questions; all yes finishes the orchestrator's own approval, a no or "cannot check yet" stays with you.
- Transparent: the sidebar lists its latest decisions with the reason and what each cost on its model (from native session logs, never estimated), its cost today and over 7 days, and its thread's health. Each paper records its review cost.
- Robust: a review that provably never reached T3 is resent with backoff (at most three sends); a stopped orchestrator run or a lost thread moves the paper to you at once; papers wait while its thread is gone; collect recovery and settlement retries back off and never stop. Status polls are single-flight.
- Stop using it (Settings) clears only the office setting; its folder and T3 thread stay. Nothing is created in `~/T3 Projects` until you set it up.

## Orchestrator chair

Orchestrator settings, Take the chair (`src/office/chair.ts`). The AI orchestrator rests (presence away) and the view is the counter: waiting workers in line, the first one's report on the counter (request, report, evidence, notes, model, effort, cost, link to the chat). Approve (A) stamps it; Follow up (F) needs a note; arrows move through the line. Notes survive leaving. Leaving restores the previous orchestrator state. A chair approval is the user's review, recorded with `chair: true`; outside the chair the orchestrator must review first.

## Personas and generated text

- `src/robot/persona.ts` writes each worker's persona from its hire preferences (hobby, apps, editor, windows, launch and switching habits, git, music, notes, games, socials) plus approved work only. Approvals are recorded once per paper (`Roster.recordApproval`).
- `electron/daily-writer.cjs` saves the persona files to the app data folder (`daily/personas/`, next to `daily/dialogs.json`) and once a day asks the headless writer (`electron/headless-writer.cjs`) to read them one after another and write conversations, per-robot lines, CEO lines, gossip, Botcord messages, Tube titles and the day's event in the current language. The writer runs an installed harness CLI headlessly (Codex `codex exec` or Claude Code `claude -p`, T3's text generation model when its CLI is installed, otherwise the cheapest default), with no tools, no MCP servers, no saved session and a strict timeout. It never creates a T3 thread.
- A pack written in the current language is shown as written; others go through the existing localization. Office & tools, Rewrite robot lines regenerates on demand, for example after a language change.

## Threads

- After each newly finished run, the app asks T3 to regenerate the title (`thread.metadata.update` with `regenerateTitle`, the same command as T3's menu action, using T3's text generation model). Once per run, never for pinned threads, settled work or linked computers; existing history is recorded without renaming on first use (`electron/title-refresh.cjs`).
- Desk name plates lead with the job title, the worker's name below.
- The thread list shows pinned threads first, then the title, and the worker's name and model.

## Evidence

`scripts/review/verify-workers-native.cjs` runs the real Electron main process and renderer build against synthetic office data with T3 transport recorded instead of sent, and captures before (previous commit's own build and backend) and after screenshots. Node checks: room policy, coin retention, worker match (real Roster), reports and settlement recovery (approve, collect, chair), monitor tasks, title refresh; all part of `npm run verify:update`.

## Kept desks

Collecting finished work settles it in T3 (the app asks again once if T3's record did not change,
and shows an error on the desk if it still did not). The desk then stays: its monitor shows the
report with a "Settled" chip and a "Remove desk" button, and its robot heads off. New work takes
a kept desk before a new desk is added, and a kept desk that was taken over is never recreated.
The kept list is saved in settings (`keptDesks`) and pruned when a session is reopened or gone.
