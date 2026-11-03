# Workers and desks

Settled with the user on 2026-11-03. This is the model every robot, desk and thread feature follows. Each section is marked **built** or **planned**. Check the code before relying on a planned part.

## The model in one sentence

A robot is a permanent **worker**. A desk is one **job**, which is one T3 thread. You find work by its desk, not by its robot.

## Workers

- A worker keeps the same name, look, accessories, persona, preferences and history for life. (built: identity and preferences; planned: written persona)
- A worker's **setup** is a harness and a model, for example Codex with GPT-5 or Claude with Opus. The provider palette shows it. Reasoning effort and speed are chosen per job and do not define a worker. (built: hiring and automatic assignment match on both)
- Workers are shared across offices. A free worker in the break room can take a job in any project. (built)
- A worker can be **retrained** to another harness or model from its focus view. Its shape and personality stay. (planned)
- A worker can **retire**. Retired workers leave the floor and appear on a staff wall with their history. Nothing is deleted. Robot of the month is shown there. (planned)
- You do not chat with a robot. Clicking a desk or its robot opens that job's thread. (built)

## Hiring

1. Click an empty desk. A small composer opens, like a new T3 thread: prompt, attachments, harness, model, reasoning and speed, plus an optional role. (built)
2. The composer shows the full-body worker who will take the job: a free worker with that exact harness and model (most jobs first, arrows to pick another), or a newly generated hire if there is none. Changing the harness or model swaps the preview. The new hire keeps the previewed look. (built, `src/office/hire.ts`)
3. **Hire** starts the thread. The worker sprints to that exact desk, sits and starts. (built: sprint in the halls; the break room exit keeps its own pace)
4. No context matching and no "familiar robot" ranking. A new thread is always a new thread. (built)
5. Threads started outside Lucid follow the same rule: a free worker with the same harness and model, else a new hire. (built, `Roster.assign`)

The number of workers grows only when nobody free has the requested setup.

## Desks are fixed places

**Built:**
- Desk k in a room is reservation k (`src/office/room-policy.ts`). A desk never moves because another desk was added, cleared or finished.
- New work takes the first empty place in the room: a hole, or a place held only by a quiet thread. Active work is never displaced.
- A settled, collected job releases its place. Its desk becomes an empty hire spot in the same position.
- The room only grows or shrinks at its end. Only the last free desk can be removed by hand.
- Dragging desks swaps only the desks involved.

Checked by `scripts/verify-room-policy.mjs` and `scripts/verify-coin-retention.cjs`, both part of `npm run verify:update`.

## Job lifecycle (planned unless noted)

1. Working: the worker sits at the desk and the screen shows the work. (built)
2. Done: the worker prints a report, carries it to the orchestrator and waits in line. No completion or collect screen appears yet.
3. Review by the AI orchestrator, or by the user from the orchestrator chair.
   - **Follow up:** the worker takes the report back to the same desk and continues the same thread.
   - **Approve:** the worker returns to its desk. The screen shows the report and a single **Collect** button. There is no Close or other action.
4. Collect: coins pop out of the screen and fly to the counter, with a count-up sound as they land. The thread is settled in Lucid, the desk clears in place, and the worker goes to the break room as a free worker.
5. **Collect all** remains for jobs approved while the user was away.

## Managers (planned)

Managers are pinned threads with a project role. They are permanent desks that are never collected. They look different from workers: a dark or black finish and a crown that carries the project logo. Their desks are special, for example multi-screen desks, so they stand out from worker desks.

## Focus view (planned)

- First click selects a robot.
- A second click zooms in. The robot levitates and the room fades into its own background. It shows the name, full body, written persona, record (jobs, approved reports, coins), the current job with Open chat, Retrain, Retire and outfit customize.
- Escape or clicking outside returns.

## Orchestrator chair (planned)

- Click the orchestrator, then Take the chair. The camera moves to the orchestrator's seat facing the counter and the line of waiting workers. The AI orchestrator pauses.
- The first worker hands over its report. The user reads it (request, result, changes, real evidence, model and cost, link to the full chat) and chooses Approve (stamp) or Follow up (short note).
- Keyboard: approve, follow up, previous and next in line. Unfinished notes are kept.
- Leave the chair to hand control back. A report being read returns to the front of the line.

## Personas and generated text (planned)

- Each worker has a persona Markdown file. It is written at hire from the worker's existing preferences: hobby, editor, tiling or floating windows, games, socials, apps. It is extended by a short line each time one of its reports is approved: kind of work and project, never code, paths or secrets.
- Once a day, Lucid generates each worker's dialog, chats (Botcord and similar), Tube titles and other flavor text from the personas, in the user's language. Changing the language offers Regenerate.
- Generation uses the text generation model selected in T3 Code settings (Settings, Text generation). It extends the existing daily pack in `src/orchestrator.ts` and `electron/orchestrator.cjs` rather than adding a second system.
- Flavor text is playful but never invents operational facts. Only approved reports may be referenced as real work.

## Threads (planned)

- A thread's title is regenerated as the conversation progresses, so it describes the current work.
- Titles are shown more prominently on desks and in lists.
- The thread list shows each thread's worker portrait.

## Build order

1. Fixed desks (built)
2. New hire flow with worker preview and sprint (built)
3. Approval, report on screen, Collect clears the desk
4. Focus view with Retrain and Retire, manager look and desks
5. Orchestrator chair
6. Personas, daily generated text, thread titles and portraits
