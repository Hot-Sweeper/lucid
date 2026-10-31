# Harness looks: research notes (October 2026)

Short notes on how each agent harness looks, used to theme the harness app in `themes.ts`, `harness.ts` and `harness.css`.
The recreations are recognisable, not pixel copies. Hex values marked "approx." are estimates from screenshots or memory.
Counters we cannot know for real (tokens, cost, context left) are left out on purpose.

## Claude Code
**CLI (v2.1.x)**
- Near-black terminal, white text, dim `#999`. Brand clay `#D77757` for the logo, spinner and welcome box.
- Success marker green `#4EBA65`, error `#FF6B80`. Plan mode teal `#48968C`.
- Compact welcome: pixel mascot or spark mark, `Claude Code v2.1.316`, then `Opus 5.5 · Claude Max`, then cwd. The session header can read "with high effort".
- Prompt: full-width `─` rules above and below, with `>` (newer builds use `❯`). Past user turns are echoed as `> text` on a dim strip.
- Tool calls: `⏺ Read(src/app.ts)`, then `⎿  Read 120 lines`. Other forms are `⏺ Bash(cmd)`, `⏺ Update(path)` with "Updated x with 3 additions", and `⏺ Search(pattern: "x")`.
  - The `⏺` is grey and blinking while running, green when done, red on failure.
  - Assistant text also starts with a white `⏺`.
- Spinner: `· ✢ ✳ ✶ ✻ ✽` played back and forth in clay, with a shimmer over a whimsical verb, e.g. `✻ Combobulating… (12s · esc to interrupt)`.
  - Finish line: `✻ Worked for 45s`. Thinking shows as `∴ Thinking…`.
- Footer: `? for shortcuts` on the left and mode lines (`⏵⏵ accept edits on`). Effort levels are low, medium, high, xhigh and max.

**Desktop app, Code tab**
- Warm dark `#262624`, sidebar `#1F1E1D`, composer `#30302E` with a thin border, text `#F5F4EF`, secondary `#A6A39A`.
- Sans UI with a serif greeting. The send button is a clay circle with an up arrow.
- Sidebar: `+ New`, then sessions with a status dot that spins while running.
- Title bar: session title plus Changes, Terminal and Files panes.
- Transcript: collapsed tool rows ("Read 3 files", "Ran npm test", "Edited App.tsx +12 −3") and prose replies.
- Composer row: mode, then a model picker ("Opus 5.5") with an Effort section.

## OpenAI Codex
**CLI (rust v0.166)**
- Terminal background, accent blue `#63A8F8`.
- Header: `>_ OpenAI Codex (v0.166.0)` with the cwd. The `/status` card is a dim box with `model: gpt-5.6-sol high` and `directory:`.
- Prompt `›` on a lighter strip, placeholder "Ask Codex to do anything".
- Transcript: `•` bullets. Examples: `• Explored └ Read diff.rs`, `• Ran echo hi └ hi`, `• Edited 2 files (+6 -1)`. A failure shows as `✘`.
- Working: `• Working (0s • esc to interrupt)` with a shimmer. The header turns into the reasoning summary.
- Finish: `─ Worked for 1m 12s ─────`.
- Footer: `? for shortcuts` on the left, and a status line with `gpt-5.4 high · main` (model plus effort).

**Desktop app (now the ChatGPT desktop app, Codex mode)**
- Dark `#181818`, sidebar `#1F1F1F`, text `#ECECEC`, muted `#9B9B9B`, blue accent `#339CFF`. System sans.
- Sidebar: "New chat", then Projects with chats and Recents.
- Top bar: title, Open, and `+N −N`.
- User messages are right-aligned grey bubbles. Collapsible "Explored / Ran / Edited" rows are followed by a "Worked for 2m 13s" divider.
- Composer: `+`, the model and reasoning picker ("GPT-5.6 Sol · High"), then a round send button.
- Logo: a rounded cloud outline with `>_` inside.

## Gemini CLI (v0.66)
- Black background. Gradient `#4796E4 → #847ACE → #C3677F`.
- Accents: blue `#87AFFF`, purple `#D7AFFF`, green `#D7FFD7`, gray `#AFAFAF`.
- Header: a gradient `>` chevron block mark next to `Gemini CLI v0.66.0`.
- Prompt: `>` between `─` rules, placeholder "Type your message or @path/to/file". Replies start with `✦`.
- Tool calls sit in rounded boxes: `✓  ReadFile src/app.ts`, `✓  Shell npm test`.
  - Glyphs: ✓ done, `o` pending, `x` error. The border turns yellow for shell.
- Spinner: braille dots plus a witty phrase ("Reticulating splines") or the thought subject, then `(esc to cancel, 12s)`.
- Footer columns: `workspace (/directory)`, `sandbox`, `/model`, `context`. The model appears only here; there is no effort level.
- Consumer users moved to the Antigravity CLI in June 2026, but the tool still ships.

## Google Antigravity
- Agent-first IDE. Antigravity 2.0 (May 2026) is a desktop command center: a sidebar with Pinned, Projects and Conversations, a conversation view, and an artifacts pane.
- Finished work collapses under "Worked for 1m 12s". Terminal steps are collapsed rows.
- Composer: `+`, `@` and `/`, a model selector, and reasoning effort Low, Medium or High.
- CLI `agy`: a `>` prompt, plus a status bar with the model and running subagents.
- Logo: a tall rounded arch (an "A" with flared feet) filled with Google yellow `#FFE432`, red `#FC413D`, green `#00B95C` and blue `#3186FF`.

## OpenCode
**TUI**
- Background `#0a0a0a`, panel `#141414`, element `#1e1e1e`, text `#eeeeee`, muted `#808080`.
- Primary peach `#fab283`, blue `#5c9cf5`, purple `#9d7cd8`, success `#7fd88f`, error `#e06c75`.
- Two-tone block wordmark "open" (muted) plus "code" (bright).
- The prompt box has a thick coloured left bar `┃`. Under it: `Build · claude-opus-5-5 Anthropic · high`.
- Tool lines:
  - `→ Read path`, `← Edit path`, `$ cmd`
  - `✱ Grep "x" · 3 matches`, `% WebFetch url`, `⚙ tool`
  - `Thinking: <title>`, shown muted
- Braille spinner. Finish: `▣ Build · model · 12.3s`.

**Desktop app (beta)**: Inter with IBM Plex Mono, bg `#101010`, brand peach. It has a session header, a composer and a file tree.

## Pi (badlogic/pi-mono)
- TUI only, on the terminal background. Text `#dcdde3`, muted `#a0a4b0`, accent violet `#c18ee0`. User messages sit on blue `#283055`.
- Tool calls are padded tinted blocks: grey `#33353a` while pending, green `#1c3b2e` on success, red `#45281f` on error. Titles are bold (`$ npm test`, `read src/a.ts`), with muted output.
- The editor is framed by rules whose colour shows the thinking level: off grey, low blue, medium purple, high magenta, xhigh pink, max orange.
- Footer: `~/proj (main)`, with `(anthropic) claude-opus-4-5 • high` on the right.
- Logo: a pixel π in coral, blue and yellow half blocks.

## Hermes Agent (Nous Research)
- CLI default skin: bronze `#CD7F32` borders, gold `#FFD700` title, amber `#FFBF00` accent, cornsilk `#FFF8DC` text.
- Banner: a "HERMES-AGENT" block wordmark shaded gold to bronze, then a bordered panel with a caduceus, the model and the cwd.
- Prompt `❯`. Responses are labelled `☤ Hermes`.
- Classic tool lines: `┊ terminal ls -la (0.3s)`.
- Kaomoji spinner: `(｡•́︿•̀｡) pondering... (1.2s)` while working, then `✧٩(ˊᗜˋ*)و✧ got it!`.
- Status bar: `☤ model │ context │ time`.
- Hermes Desktop (preview June 2026): running tasks on the left, chat on the right, Nous blue `#0053fd`.

## OpenClaw
**TUI** (built on pi-tui)
- Text `#E8E3D5`, dim `#7B7F87`, gold `#F6C453`, user bg `#2B2F36`. Tool card backgrounds tinted the same way as Pi's.
- Header: `openclaw tui - ws://127.0.0.1:18789 - agent main - session main`.
- Tool cards have a gold bold title plus "(running)" or "(completed)".
- Status: `noodling… • 4s | streaming`. Footer: `agent main | session main | model high`.

**Control UI**
- Bg `#0e1015`, card `#161920`, text `#f4f4f5`, lobster red `#ff5c5c`, teal `#14b8a6`. Instrument Sans.
- Sidebar with agent and sessions. Tool activity collapses to "Worked for …".
- Logo: a red lobster with an egg-shaped body and two claws.

## Cursor
**Agents window (3.x)**
- Neutral dark `#181818`, sidebar `#141414`, cream `#EDECEC`. System sans.
- Sidebar: "New Agent", then agents with diff stats.
- Composer placeholder "Plan, @ for context, / for commands", with a mode chip `∞ Agent`, a model chip and an up-arrow send button.
- Tool rows are muted one-liners ("Read file.ts", "Grepped …", "Thought for 4s").
- Logo: an isometric cube (hexagon) with a facet cut out.

**CLI (`agent`)**
- Header has a left bar with "Cursor Agent" and the version. The input prefix is `→`.
- Footer: model label with effort folded in ("GPT-5.6 Sol High"), then the cwd.
- Tool rows are a bold verb plus a dim target, e.g. `Grepped "foo" in src`.
- Finish: a cyan-bordered "Summary" box. Spinner: two-cell braille, label "Generating".

## Grok Build (xAI)
- Ratatui TUI, GrokNight theme.
  - Backgrounds `#0a0a0a`/`#141414`, text `#e1e1e1`.
  - Magenta `#bb9af7` for the assistant and thinking, grey `#787878` for tools, blue `#7aa2f7` for system, teal `#1abc9c` for the model.
  - Error `#f7768e`, success `#9ece6a`.
- Layout:
  - Blocks have a left accent rail `┃`. Prompts are prefixed `❯ `.
  - Rounded prompt box with the placeholder "Type a message...".
  - Info row under the box: model, then flags.
- Text:
  - Tool rows: "Read path", "Run cmd", "Edit path +3 -1".
  - Thinking: "Thought for 3.2s".
  - Spinner: braille, then label, timer and `[stop]`.
- Logo: a circle split by a diagonal slash.

## Aider
- Plain terminal. Your input green `#00cc00`, assistant blue `#0088ff`, errors `#FF2222`, warnings `#FFA500`.
- Startup lines: `Aider v0.86.2`, `Main model: X with diff edit format, reasoning high`, `Git repo: .git`.
- Prompt: `> ` after a `─` rule. Edits read "Applied edit to x.py".
- Spinner: "Waiting for <model>" with a bouncing `░█` scanner.

## GitHub Copilot CLI
- ANSI palette with Copilot magenta for the brand, blue accent and grey borders.
- Input placeholder "Enter @ to mention files or / for commands".
- Tool rows: `● Title`, then a muted `└ 12 lines...`. Spinner frames `∙ ◉ ◎` with "Thinking (Esc to cancel)".
- Footer: cwd and branch, then the model with its effort.
- Logo: a goggle-eyed helmet face.

## Amp (Sourcegraph)
- CLI and apps. Dark green `#0c1516`, cream `#dfdfc1`.
- "The Dial" picks the mode: low, medium, high or ultra.
- Logo: lowercase "amp" where the m is three slanted strokes.
- The TUI glyphs could not be confirmed, so the recreation stays plain.

## Others
Kimi CLI, Qwen Code, Factory Droid, Cline and Kilo fall back to the generic console, which shows their name, model and effort.

## T3 Code (stable and Nightly)
Sources: the installed T3 Code (Nightly) 0.1.5-nightly.20261029 (its bundled web UI in `resources/server.asar`, installer art in `app.asar`), the public screenshot on t3.codes, and github.com/pingdotgg/t3code. thesvg.org has no T3 Code entry (only "t3-stack", a different project).
- Mark: the T3 glyph path from T3 Code's own `T3Wordmark` component, set next to "Code" in the muted colour. App icons: white T3 on black (stable), white T3 on a night sky with clouds (Nightly).
- Default dark theme: canvas `#000`, sidebar and composer `#0e0e0e`, hairlines white 8%, text neutral-100, muted neutral-400, your messages on `#1e1e1e`, primary `oklch(57.1% .21 264)`. Status colours: Working info blue, Done emerald, Input indigo, Approval amber.
- Sidebar: wordmark, Search with filter, new project and new thread icons, thread rows (project badge, project, time or status, title, harness logo), then a "Working n" section.
- Thread: breadcrumb `project / title`; work rows "Ran cmd", "Read file", "Edited file", "Searched files", "Searched the web", "Thought"; "Working for 12s" while running; "Worked for 20s ›" folds the work before a reply.
- Composer: "Ask anything. @ files, $ skills, / commands", paperclip, harness logo with model and effort ("Opus 5.5 High"), round send button.
- Nightly: with the default "Artwork" setting the sidebar header sits on the night sky art (stars, sparkles, two clouds, `--stage-night-*` colours) with a white wordmark. Stable shows no artwork. The "Nightly" version pill only appears with the "Version pill" setting. The Windows app is named "T3 Code (Nightly)".
