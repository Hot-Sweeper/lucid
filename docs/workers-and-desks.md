# Workers and desks

Settled with the user on 2026-11-03. This is the model every robot, desk and thread feature follows. All parts below are built; the evidence section says what was checked.

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

## Desks are fixed places

Desk k in a room is reservation k (`src/office/room-policy.ts`). New work takes the first empty place; active work is never displaced; a collected job releases its place and the desk stays as an empty hire spot; rooms change size only at their end; only the last free desk can be removed.

## Job lifecycle

1. Working: the worker sits at the desk.
2. Done: it prints its report, carries it to the orchestrator and waits in the line. Its desk keeps its place with an empty chair (`reviewPending`). No completion screen appears.
3. Review by the AI orchestrator, or by you from its chair (both review modes queue the robot).
   - **Follow up** sends your note to the same thread; the worker goes back to work.
   - **Approve** records "approved, ready to collect" (`electron/reports.cjs`). It does not settle. The worker returns to its desk.
4. The desk screen shows the job title, the review summary and one **Collect** button.
5. Collect settles the thread through the review (`reports.manual(id, 'collect')`), pays the coins, which fly to the counter and clink as each lands while the balance counts up, and clears the desk. If T3 is slow, the collect intent is saved and finishes on recovery.
6. Without an orchestrator, work finished while Lucid is open shows Collect directly and settles through `t3s:settle`.
7. The coin tray's Collect all only offers collectible work and also clears those desks.

## Managers

Managers are pinned threads with a project role. They keep their desk and are never collected. They are drawn with a graphite finish and a crown carrying the project logo (`managerLook`, applied when drawn, never saved) at desks, walking, in portraits and in the thread list. Their desks have two side screens with the project logo.

## Focus view and staff wall

A second click on a robot (walking, or seated at a focused desk) opens `src/office/worker-focus.ts`: the robot floats over a backdrop tinted by its harness, with setup, current job, record, written persona and recent approved work, and Open chat, Customize, Retrain and Retire. The desk menu has Worker profile; Office & tools has Staff wall.

## Orchestrator chair

Orchestrator settings, Take the chair (`src/office/chair.ts`). The AI orchestrator rests (presence away) and the view is the counter: waiting workers in line, the first one's report on the counter (request, report, evidence, notes, model, effort, cost, link to the chat). Approve (A) stamps it; Follow up (F) needs a note; arrows move through the line. Notes survive leaving. Leaving restores the previous orchestrator state. A chair approval is the user's review, recorded with `chair: true`; outside the chair the orchestrator must review first.

## Personas and generated text

- `src/office/persona.ts` writes each worker's persona from its hire preferences (hobby, apps, editor, windows, launch and switching habits, git, music, notes, games, socials) plus approved work only. Approvals are recorded once per paper (`Roster.recordApproval`).
- `electron/daily-writer.cjs` saves the persona files to the orchestrator folder (`personas/`) and once a day asks T3 Code's text generation model (`textGenerationModelSelection` in T3's `settings.json`, default `gpt-6-luna` with low reasoning) to read them one after another and write conversations, per-robot lines, CEO lines, gossip, Botcord messages, Tube titles and the day's event in the current language. Like the translator, the helper thread is hidden from the office and reviews and archived afterwards.
- A pack written in the current language is shown as written; others go through the existing localization. Office & tools, Rewrite robot lines regenerates on demand, for example after a language change.

## Threads

- After each newly finished run, Lucid asks T3 to regenerate the title (`thread.metadata.update` with `regenerateTitle`, the same command as T3's menu action, using T3's text generation model). Once per run, never for managers, settled work or linked computers; existing history is recorded without renaming on first use (`electron/title-refresh.cjs`).
- Desk name plates lead with the job title, the worker's name below.
- The thread list shows each worker's face (managers crowned), the title, and the worker's name and model.

## Evidence

`scripts/verify-workers-native.cjs` runs the real Electron main process and renderer build against synthetic office data with T3 transport recorded instead of sent, and captures before (previous commit's own build and backend) and after screenshots. Node checks: room policy, coin retention, worker match (real Roster), reports and settlement recovery (approve, collect, chair), monitor tasks, title refresh; all part of `npm run verify:update`.
