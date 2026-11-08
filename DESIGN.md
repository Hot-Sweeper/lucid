# Lucid interface

## Chat shelf motion

Opening and closing the conversation uses one 200ms compositor slide with the camera's shared glide curve. The grid changes width once, the real transcript stays at its final width, and the office camera glides to its new framing. There is no delayed fade or per-frame grid resize. Reversals continue from the shown position. Closing moves focus to the rail immediately and makes the departing panel inert. Opening preserves drafts, transcript nodes and reading position. Reduced motion applies the final layout immediately. Drag resizing remains live and cancels toggle motion. A quiet shared switch cue follows animated toggles.

## Robot journeys

The visible office ends at the inner edges of the sidebars, including collapsed rails. Use the scene's real rectangle, subtract only panel overlap, and refresh these limits when panels resize. Remote buildings share those same clipped limits. Horizontal entry keeps a whole-body guard without an extra screen-space approach behind the sidebars.

Transit robots skip only the fully offscreen prefix of their collision-checked path. A conservative viewport includes their whole body, hats, carried papers and additional vertical approach space. They run into view from that boundary; visible crossings and arrivals play continuously. Camera following, panning, zooming, glides, held robots and moving furniture disable shortcuts. No fading or teleport effects conceal a visible relocation. Leisure inside rooms keeps its existing pace. Work runs use longer strides, tucked recovery feet, bent counter-swinging arms, a forward lean and a brief airborne pose, then brake into the existing chair handoff. Reduced motion keeps the quieter existing gait. Agent execution remains independent of the commute.

Extend the established living robot office. Keep its warm artwork, navy and lavender panels, peach actions, Lexend interface type and JetBrains Mono code type.

## App library

The small four-square button sits immediately before the existing settings control in the sidebar header. The library uses the existing `--night`, `--night-2`, `--night-3`, `--ink`, `--ink-2` and `--accent` tokens, desktop app icons, compact category controls and unboxed app tiles. The library replaces the central 2D scene as an ordinary content view, filling its grid area with no floating frame or backdrop. The sidebar and conversation remain available. A Back to office action, the library button or Escape returns to the existing office view without rebuilding it. On narrow screens, the app grid sits above the detail view.

Search includes familiar service names for the fictional counterparts. Work-only surfaces are described honestly. Available demos run original app code in a disposable document, separately from real robots and backend actions. Switching apps or closing the library removes that document.

View entry uses a 180 ms opacity fade on `cubic-bezier(.23,1,.32,1)`; controls use 130 ms color and press feedback. Reduced motion removes entrance motion. Shared open/switch sound cues respect Lucid's existing sound settings.

## Hiring

Use a 900px dialog with a 232px worker column and a flexible task column. The shared legacy dialog rule must not narrow this screen back to 620px. Give the actual full-body robot the stage, retain its identity and accessories, and keep the task label visible above the composer. Runtime controls use a two-column grid, readable secondary labels, and 38px controls. The footer stays visible while the body scrolls. Narrow layouts stack a compact worker preview above the task. Press and focus feedback use the peach accent and 140ms strong ease-out; reduced motion removes transforms. Preserve the established navy/lavender surfaces and existing launch behavior.

## Project office boards

Project offices open a personal planning board from their sidebar icon, a compact clipboard control or the office menu. Keep the existing office scene and robot artwork. The clipboard and collapse controls are a 40px pair with an 8px gap in the clear header space to the right of the window. Never cover the project name, window or door with a wide generated text panel. There is no default slogan in the room. Saved banners and calendar-day countdowns live inside the opened board, with a concise tooltip on its clipboard. The expanded board uses existing navy surfaces, readable lavender text, Lexend, peach actions, a goal whiteboard and project calendar. It enters in 180ms with the shared open sound; reduced motion removes the entrance transform. Narrow layouts stack the board sections, with a scrolling body and visible save footer.

Goals and dates are personal plans, separate from real T3 task completion. T3's configured text generation model writes optional human goals, a motto and occasional project-specific banter. Accepting suggestions is explicit. Only current named project robots can speak; existing task/question bubbles take priority. A generated board may refresh after real thread-state changes at most once an hour while visible. Generated replies never replace saved plans. English/German labels and generated flavor follow the office language. Failed saves preserve a local project draft; revision checks prevent overwriting another window. Project boards currently belong to local offices, with linked environments and companion clients excluded.

## Desk plan widget

An individual robot's plan is a compact golden checklist icon with its real completion count beside the monitor. Clicking the widget fills that monitor with the live plan; it does not open the conversation's plan section. The existing desktop and its drafts remain mounted underneath. Back to desktop, the widget again, or Escape from the plan restores the desktop. Step updates preserve reading position and keep the view open, including when the plan becomes empty. Reassigning or removing the desk closes its old plan.

Use the monitor's existing navy/lavender surfaces and shared detail tiers, readable 21px step text at logical screen size, numbered steps and distinct text labels for their status. The widget has a 140ms press/hover response and the screen a 180ms entrance, with shared open/switch sounds. Reduced motion removes transforms. Focus enters the close action, the step list is keyboard scrollable, and closing returns focus to the widget. Plans and human question/completion screens own desktop coverage independently so closing one cannot uncover the other. Only controls are localized; real agent plan text stays as authored.

## Office radio

Keep the music controls inside the existing Office & settings shelf, below the volume sliders. Use an unboxed compact section, native themed genre selector, wrapping song title, plain genre/tempo text, and two 38px actions for Pause music and Next song. Preserve the navy surfaces, lavender text and peach keyboard focus. Controls respond in 130ms with the shared strong ease-out; reduced motion removes press transforms. The evolving journey is the default, with a quiet chapter description rather than a decorative visualization. Mode changes finish the current song unless Next is requested. English and German controls update instantly; song names remain authored. State comes from the audio owner, with no UI polling timer.


## Office store and appearance collections

Lucid Supply fills the center grid area, using the app library's ordinary content-view pattern. Keep the office scene mounted, make it inert while covered, preserve both side shelves, and coordinate mutually exclusive center views. Return with Back to office or Escape, restoring focus and retaining store filters and reading position.

Use existing navy/lavender tokens, peach actions, Lexend, 24px gutters, compact wrapping category buttons, unboxed product entries and material previews drawn with the original floor/decor SVG functions. Theme collections combine existing floors, walls and computer casings. Classic, cream, mint, peach, retro and graphite cases preserve the actual monitor screen dimensions, applications and detail tiers. Computer choices apply to a whole office or an individual physical seat and live in its saved RoomTheme. Collections preserve decorations and explicitly replace individual computer overrides. Shared controls use 130ms feedback and entry fades in 180ms with the strong ease-out; reduced motion removes transforms and entry animation. Reuse open, switch and purchase SFX and the existing game-content localization adapter.

Purchases use earned office coins. Owned pieces are reusable across offices; collections charge only for missing pieces in a single wallet transaction. Enforce affordability, season and level eligibility in the wallet, as well as the displayed action. Buying individual pieces and equipping them are distinct actions. Keep failed-save ownership visible with a retry path. Never claim these casing choices change a robot's real computing resources.

## Song library

The app library includes a live Song library entry in Media, separate from the robots' Botify demo. Show the real office soundtrack as compact title/genre/duration rows with whole-row Play, Pause and Resume actions. The existing radio controls sit in a compact disclosure above search and genre filtering. Preserve row nodes, focus, search and scrolling during playback updates. Use one constrained list scroll region, established navy/lavender/peach tokens, 130ms press feedback and reduced-motion support. Narrow app-library views give the songs the content area and offer All apps to return to the app grid. Leaving or closing the library releases UI subscriptions while office music continues through its existing audio owner. Song choices play once, then the selected music direction resumes.


## Hiring a robot

Keep the task as the primary writing surface, with attachments inside it and runtime choices below. Use an unboxed, full-body worker preview and plain name/availability text. Harnesses are a wrapping native radio group with Lucid's existing official logos, a visible selection check and peach keyboard focus. Model and provider-specific options retain semantic selects. Preserve Lexend, navy/lavender tokens, peach actions, drafts, retries, roles, customization and the worker arrival feedback.

The dialog uses a 980px maximum width, 30px desktop gutters and a 210px portrait column. At 560px it becomes one scrollable column with a compact horizontal portrait. The footer stays reachable independently of body scrolling. Use 8px composer corners, 6px choice corners and the shared 140ms strong ease-out; reduced motion removes transitions. Text uses existing ink tokens, and control boundaries use the existing higher-contrast hire control token.

Reasoning summaries render safe inline emphasis as real bold/italic/code elements in both the activity history and current status. Commands, tool output and user prompts retain their literal contents. Status text clips visually without truncating Markdown delimiters, and the complete readable summary is available in its title.


## Moving work between offices

Drag an occupied desk by its existing desk or nameplate surface into Main office, a project office or Freelancers. Reuse the office drop outline and saved thread-home assignment used by sidebar thread drops. The grabbed desk follows the pointer, while a drop in its original room retains snake reordering. Escape, lost capture, a cancelled pointer or window blur restores the original order; releasing in a corridor cancels. Main office expands when work is placed there. Explicit homes also apply to managers without changing their real T3 project, role or pin. The orchestrator retains its dedicated chair.

Desk and thread menus offer the same Move to office actions for click and keyboard use through the existing menu. Successful desk transfers use the shared switch cue. Preserve the existing artwork, drag lift, reduced-motion settling and mute behavior.

## Player-sized office widths

Offices start one workstation wide and retain their chosen width as jobs arrive or leave. Additional desks wrap in the existing snake order. The right-wall grip previews horizontal resizing in whole workstation columns, then commits through the safe floor-plan transition on release. Escape, blur, hidden documents and lost pointer capture cancel the preview. Narrow and Widen buttons and the grip's arrow keys offer the same choice without dragging. Width is saved independently for each office and computer, including collapsed offices. Controls retain Lucid's navy/lavender and peach palette, 130ms press feedback and reduced-motion behavior.


## Live office placement feedback

Reuse a single destination outline while dragging, with a numbered footprint at the reservation's actual snake position. Keep room artwork visible. Use the existing peach accent for the seat, navy for the destination label and lavender text. A 140ms opacity entrance runs once per pickup, rather than restarting on every pointer event. The grabbed workstation lifts 2.5 percent and tilts at most two degrees with pointer movement, then settles in 160ms. Reduced motion disables lift, tilt and animated footprint repositioning.

A transfer commits its saved home immediately. Keep an explicit Moving to label while the safe physical floor-plan handoff is pending, following current room geometry on world updates and clearing on physical placement. Do not slide a transferred desk back to its source before the handoff. Recheck the release coordinates so a quick final movement lands in the intended room. Existing robot routing, conversations and work continue throughout.


## Answer embeds and robot power

Assistant answers retain real T3 `html_render` visuals in the transcript, outside the progress fold. Local image, audio, video and file links resolve through the owning environment. Inline players never autoplay; downloads use a native save dialog. HTML visuals run in a separate sandbox without a preload, same-origin access, network requests or form submission. The companion keeps a static document fallback.

Native T3 references use compact robot portrait buttons with the current title, harness and model. Preserve the complete thread ID and environment identity. The whole card responds to keyboard activation; unavailable references say so.

Ultra fire uses a 64 by 80 heat field, injected around the lower robot body, advected upward with turbulent drift and cooling, and quantized into violet contribution-grid shades. Flames render behind the existing robot, without a contour glow or chair emitter. Six small embers rise and expire. Fast mode adds warm lightning and a 1.5 movement multiplier through the existing path follower. Flags come from active run options, with configured thread options as fallback, and are scoped to their own office. Reduced motion retains a still fire field and lightning with normal walking speed. Hidden/offscreen effects pause; actors release their ticker and graphics on removal.


## Completion reports on monitors

Completion reports use unboxed evidence and narrative columns, with the captured result leading and a single scrolling body. Keep original aspect ratios, descriptive captions, a wrapping thumbnail rail and full-original viewing in a native modal. At 620px, the result and narrative stack. The original task lives in a disclosure. No nested report scrollbar, uppercase kicker or colored status capsule. Preserve the existing collect/settle action and failure retry.

Use navy/lavender/peach tokens, Lexend, 18px body gutters, 24px column gaps, 6px media frames, quiet 140ms background feedback and visible peach focus. Reduced motion removes gallery transitions. Empty evidence and load failures remain explicit; uploaded user references are separate from assistant results. Only assistant screenshots linked or attached in real messages populate the result gallery.

## Thread labels at room scale

Below camera scale 1.15, desk plates show a cached 2 to 4 word topic in 14px Lexend, with the existing robot name underneath. Close views and hovered plates show the original full title. The full title remains in the tooltip and accessible label. Labels are presentation metadata, separate from T3 titles. A bounded background writer uses T3's configured text generation selection (Luna fallback), caches by thread id and exact title, and never runs in response to a zoom gesture. Missing or failed labels retain the original title. Remote environments retain their own titles without local generation.


## Questions that fit the monitor

The monitor question screen uses a compact 23px header, 18px question and 16px choices at the existing 820 by 461 logical screen size. Suppress descriptions that only repeat the option label. Keep Other and its text field on one row. Question content owns one scroll region for unusually long requests; a separate fixed footer keeps Send answer, approval controls and retry feedback visible. Preserve distinct descriptions, actual question text, selections, custom answers, keyboard focus, and the existing submission path. The sidebar answer card keeps its established typography and layout.

## Website studio on Ares

The office toolbar and robot chat open a native Lucid workspace: a large website canvas on the left and the familiar bubble conversation on the right. Keep Lexend, JetBrains Mono, the existing navy/lavender surfaces and peach controls. The studio has a separately designed light surface palette. Its chat width is retained, keyboard adjustable, and independent from the canvas scroll. Narrow windows switch between canvas and chat.

There is one visible canvas cursor. It reconstructs real saved render changes, with selection outlines, handles, a caret, placement, typing, resizing and removal. It is explicitly described as playback, never recorded mouse input. Completed projects open immediately. Replay alone deliberately reconstructs a completed page from blank. Live changes coalesce into one pending version and continue from the currently shown partial build. Reduced motion applies the final render immediately. Desktop, tablet and phone use fixed 1440×900, 820×1180 and 390×844 viewports; scaling only fits that viewport into the available canvas.

Playback uses inert serialized DOM from an actual Chromium render on Ares, with saved CSS inlined. Project scripts run only in the isolated inspection browser or the separate interactive preview origin, never in playback frames. Use website promptly switches to the real running project. The chat distinguishes actual execution from playback catching up. Actual visual inspection and image-search results appear in the conversation; ordinary tool details remain expandable.

Ares owns Codex execution, project files and its existing sign-in. Spacestation signs project-scoped requests from the Electron backend; generated pages never receive the connector key. The runner accepts only signed requests, rejects replayed nonces and browser Origin headers, and binds to Ares loopback behind its HTTPS tailnet route. Project approvals use Lucid's existing AnswerCard and only explicit once/decline decisions. Framework scripts start through Codex's normal scoped command tools, not an unrestricted runner child. An associated idle robot can mirror the canvas through the existing frontend/LOD pipeline, with the ordinary OS pointer hidden while the canvas owns its cursor.

## Robot portrait alignment

Shared robot portraits use a square frame around the actual head and hat bounds with equal padding. Remove downward SVG offsets and oversizing. Center the portrait vertically beside the complete thread text block, including manager rows, at every sidebar width. Custom profile pictures retain their existing cover framing.


## Question choice controls

Use native radio and checkbox inputs with custom Lucid visuals: a crisp lavender ring over the existing dark input surface, a peach center dot for a selected radio and a dark check on a peach selected checkbox. Unselected rows stay unboxed. The whole row activates its associated input through the label, while the custom text field keeps its own hit target. Retain compact row dimensions, visible keyboard focus, disabled semantics and native arrow-key behavior. Hover fills ease in over 130ms; selection draws over 160ms and pressing gently compresses the control. Reduced motion removes these transitions and compression; forced colors restores the platform control. Choices in the chat shelf and on desk monitors share this styling.


## Question choice controls

Use native radio and checkbox inputs with custom Lucid visuals: a crisp lavender ring over the existing dark input surface, a peach center dot for a selected radio and a dark check on a peach selected checkbox. Unselected rows stay unboxed. The whole row activates its associated input through the label, while the custom text field keeps its own hit target. Retain compact row dimensions, visible keyboard focus, disabled semantics and native arrow-key behavior. Hover fills ease in over 130ms; selection draws over 160ms and pressing gently compresses the control. Reduced motion removes these transitions and compression; forced colors restores the platform control. Choices in the chat shelf and on desk monitors share this styling.

## Managers in the sidebar

Manager entries lead with the persistent robot name and a centered 40px portrait. Project and role form one quiet context line, followed by the real thread title. Only meaningful operational status adds another line; idle timestamps, model strings, duplicate project icons and pin dots stay out of this compact view. Complete metadata remains in the tooltip. Names wrap without clipping. The new-project action uses a folder-plus control in its own reserved 32px column, revealed on hover or keyboard focus and always available on touch. It never overlays the name or title. Selected managers share the existing thread selection treatment.
