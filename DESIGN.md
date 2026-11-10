# Lucid interface

## Actual agent browser pages

When a tool identifies a browser launched in an agent workspace, the robot browser follows that exact window through a read-only capture. Retain native tabs, authentication, navigation and scroll position. Hide the duplicate Lucid tab and address bars while showing this source. Fit the complete window without stretching or cropping, on the existing navy surface. Visible views refresh once per second; covered or hidden views pause. Stopped apps and reused workspace sessions show an explicit waiting state. Never attach these handles to the host browser or to a different linked environment. Existing local frontend and HTML previews keep their own lifecycle.

## Chat shelf motion

Opening and closing the conversation uses one 200ms compositor slide with the camera's shared glide curve. The grid changes width once, the real transcript stays at its final width, and the office camera glides to its new framing. There is no delayed fade or per-frame grid resize. Reversals continue from the shown position. Closing moves focus to the rail immediately and makes the departing panel inert. Opening preserves drafts, transcript nodes and reading position. Reduced motion applies the final layout immediately. Drag resizing remains live and cancels toggle motion. A quiet shared switch cue follows animated toggles.

## Auto-hide panels

The sidebar and the chat each have a pin in their header (`edge-peek.ts`). Pinned (the default) keeps the panel in its column. Unpinned, the panel stays folded into its rail or tab and slides over the office while the pointer rests on that edge or the last few pixels of the window (110ms hover intent), so the office never reflows or jumps. It enters in 240ms on the glide curve and leaves in 170ms ease-in after a 380ms grace period. It stays out while you type in it, while one of its menus or dialogs is open, and during thread drags or resizing. A click in the office, Escape or moving away tucks it back; selecting a robot or using Ctrl+B slides it out on purpose. While peeking it carries a soft shadow on the office side only, and a 2px peach line grows on the edge being hovered. Pinning a peeking panel leaves it in place and grows the column under it. The pin is filled and upright when pinned, outlined and tilted when auto-hiding, and rocks on a no-bounce spring with the shared clip cue. Reduced motion uses fades. Both modes are saved in settings.

Chat menus (harness, model, effort) live on `<body>` at fixed viewport positions measured from their button. They open above it, or below when there is no room, and stay inside the chat's horizontal bounds.

## Robot journeys

The visible office ends at the inner edges of the sidebars, including collapsed rails. Use the scene's real rectangle, subtract only panel overlap, and refresh these limits when panels resize. Remote buildings share those same clipped limits. Horizontal entry keeps a whole-body guard without an extra screen-space approach behind the sidebars.

Transit robots skip only the fully offscreen prefix of their collision-checked path. A conservative viewport includes their whole body, hats, carried papers and additional vertical approach space. They run into view from that boundary; visible crossings and arrivals play continuously. Camera following, panning, zooming, glides, held robots and moving furniture disable shortcuts. No fading or teleport effects conceal a visible relocation. Leisure inside rooms keeps its existing pace. Work runs use longer strides, tucked recovery feet, bent counter-swinging arms, a forward lean and a brief airborne pose, then brake into the existing chair handoff. Reduced motion keeps the quieter existing gait. Agent execution remains independent of the commute.

Extend the established living robot office. Keep its warm artwork, navy and lavender panels, peach actions, Lexend interface type and JetBrains Mono code type.

## Hiring

Use a 900px dialog with a 232px worker column and a flexible task column. The shared legacy dialog rule must not narrow this screen back to 620px. Give the actual full-body robot the stage, retain its identity and accessories, and keep the task label visible above the composer. Runtime controls use a two-column grid, readable secondary labels, and 38px controls. The footer stays visible while the body scrolls. Narrow layouts stack a compact worker preview above the task. Press and focus feedback use the peach accent and 140ms strong ease-out; reduced motion removes transforms. Preserve the established navy/lavender surfaces and existing launch behavior.

## Project office boards

Project offices open a personal planning board from their sidebar icon, a compact clipboard control or the office menu. Keep the existing office scene and robot artwork. The clipboard and collapse controls are a 40px pair with an 8px gap in the clear header space to the right of the window. Never cover the project name, window or door with a wide generated text panel. There is no default slogan in the room. Saved banners and calendar-day countdowns live inside the opened board, with a concise tooltip on its clipboard. The expanded board uses existing navy surfaces, readable lavender text, Lexend, peach actions, a goal whiteboard and project calendar. It enters in 180ms with the shared open sound; reduced motion removes the entrance transform. Narrow layouts stack the board sections, with a scrolling body and visible save footer.

Goals and dates are personal plans, separate from real T3 task completion. The headless writer (an installed harness CLI, never a T3 thread) writes optional human goals, a motto and occasional project-specific banter. Accepting suggestions is explicit. Only current named project robots can speak; existing task/question bubbles take priority. A generated board may refresh after real thread-state changes at most once an hour while visible. Generated replies never replace saved plans. English/German labels and generated flavor follow the office language. Failed saves preserve a local project draft; revision checks prevent overwriting another window. Project boards currently belong to local offices, with linked environments and companion clients excluded.


## Desk plan widget

An individual robot's plan is a compact golden checklist icon with its real completion count beside the monitor. Clicking the widget fills that monitor with the live plan; it does not open the conversation's plan section. The existing desktop and its drafts remain mounted underneath. Back to desktop, the widget again, or Escape from the plan restores the desktop. Step updates preserve reading position and keep the view open, including when the plan becomes empty. Reassigning or removing the desk closes its old plan.

Use an opaque night-2 surface across the complete monitor, including the dock and menu. The world owns a numeric night lighting variable, so it cannot serve as a surface color here. A fixed compact header holds the title, real completion count, desktop return action and segmented progress track. Completed segments are mint, the active segment peach and remaining segments the quiet surface color. Use the existing shared detail tiers, 19px step text at the 820 by 461 logical screen size, 28px side gutters, numbered steps and explicit status labels. The current step has one restrained filled row. Keep authored order, long-text wrapping and one keyboard-scrollable list below the non-shrinking header. The widget has a 140ms press/hover response and the screen a 180ms entrance, with shared open/switch sounds. Reduced motion removes transforms. Focus enters the close action, the step list is keyboard scrollable, and closing returns focus to the widget. Plans and human question/completion screens own desktop coverage independently so closing one cannot uncover the other. Only controls are localized; real agent plan text stays as authored.

## Office radio

Keep the music controls inside the existing Office & settings shelf, below the volume sliders. Use an unboxed compact section, native themed genre selector, wrapping song title, plain genre/tempo text, and two 38px actions for Pause music and Next song. Preserve the navy surfaces, lavender text and peach keyboard focus. Controls respond in 130ms with the shared strong ease-out; reduced motion removes press transforms. The evolving journey is the default, with a quiet chapter description rather than a decorative visualization. Mode changes finish the current song unless Next is requested. English and German controls update instantly; song names remain authored. State comes from the audio owner, with no UI polling timer.

## Hiring a robot

Keep the task as the primary writing surface, with attachments inside it and runtime choices below. Use an unboxed, full-body worker preview and plain name/availability text. Harnesses are a wrapping native radio group with Lucid's existing official logos, a visible selection check and peach keyboard focus. Model and provider-specific options retain semantic selects. Preserve Lexend, navy/lavender tokens, peach actions, drafts, retries, roles, customization and the worker arrival feedback.

The dialog uses a 980px maximum width, 30px desktop gutters and a 210px portrait column. At 560px it becomes one scrollable column with a compact horizontal portrait. The footer stays reachable independently of body scrolling. Use 8px composer corners, 6px choice corners and the shared 140ms strong ease-out; reduced motion removes transitions. Text uses existing ink tokens, and control boundaries use the existing higher-contrast hire control token.

Reasoning summaries render safe inline emphasis as real bold/italic/code elements in both the activity history and current status. Commands, tool output and user prompts retain their literal contents. Status text clips visually without truncating Markdown delimiters, and the complete readable summary is available in its title.


## Moving work between offices

Drag an occupied desk by its existing desk or nameplate surface into Main office, a project office or Freelancers. Reuse the office drop outline and saved thread-home assignment used by sidebar thread drops. The grabbed desk follows the pointer, while a drop in its original room retains snake reordering. Escape, lost capture, a cancelled pointer or window blur restores the original order; releasing in a corridor cancels. Main office expands when work is placed there. Explicit homes also apply to pinned threads without changing their real T3 project or pin. The orchestrator retains its dedicated chair.

Desk and thread menus offer the same Move to office actions for click and keyboard use through the existing menu. Successful desk transfers use the shared switch cue. Preserve the existing artwork, drag lift, reduced-motion settling and mute behavior.
## Player-sized office widths

Offices start one workstation wide and retain their chosen width as jobs arrive or leave. Additional desks wrap in the existing snake order. The right-wall grip previews horizontal resizing in whole workstation columns, then commits through the safe floor-plan transition on release. Escape, blur, hidden documents and lost pointer capture cancel the preview. Narrow and Widen buttons and the grip's arrow keys offer the same choice without dragging. Width is saved independently for each office and computer, including collapsed offices. Controls retain Lucid's navy/lavender and peach palette, 130ms press feedback and reduced-motion behavior.


## Live office placement feedback

Reuse a single destination outline while dragging, with a numbered footprint at the reservation's actual snake position. Keep room artwork visible. Use the existing peach accent for the seat, navy for the destination label and lavender text. A 140ms opacity entrance runs once per pickup, rather than restarting on every pointer event. The grabbed workstation lifts 2.5 percent and tilts at most two degrees with pointer movement, then settles in 160ms. Reduced motion disables lift, tilt and animated footprint repositioning.

A transfer commits its saved home immediately. Keep an explicit Moving to label while the safe physical floor-plan handoff is pending, following current room geometry on world updates and clearing on physical placement. Do not slide a transferred desk back to its source before the handoff. Recheck the release coordinates so a quick final movement lands in the intended room. Existing robot routing, conversations and work continue throughout.


## Completion reports on monitors

Completion reports use unboxed evidence and narrative columns, with the captured result leading and a single scrolling body. Keep original aspect ratios, descriptive captions, a wrapping thumbnail rail and full-original viewing in a native modal. At 620px, the result and narrative stack. The original task lives in a disclosure. No nested report scrollbar, uppercase kicker or colored status capsule. Preserve the existing collect/settle action and failure retry.

Use navy/lavender/peach tokens, Lexend, 18px body gutters, 24px column gaps, 6px media frames, quiet 140ms background feedback and visible peach focus. Reduced motion removes gallery transitions. Empty evidence and load failures remain explicit; uploaded user references are separate from assistant results. Only assistant screenshots linked or attached in real messages populate the result gallery.

## Answer embeds and robot power

Assistant answers retain real T3 `html_render` visuals in the transcript, outside the progress fold. Local image, audio, video and file links resolve through the owning environment. Inline players never autoplay; downloads use a native save dialog. HTML visuals run in a separate sandbox without a preload, same-origin access, network requests or form submission. The companion keeps a static document fallback.

Native T3 references use compact robot portrait buttons with the current title, harness and model. Preserve the complete thread ID and environment identity. The whole card responds to keyboard activation; unavailable references say so.

Ultra fire follows the approved compact purple pixel-fire reference documented in `docs/robot-power.md`. A 32 by 40 upward-advected heat field uses touching violet, magenta and lavender cells, with no gutters or cell outlines. Shoulder-side sources feed uneven tongues behind the head, while a separate layer adds lower-body foreground wisps. Preserve the actual robot, face, logo, chair and nameplate. Active run options still determine Ultra and fast state; reduced motion freezes the field and actor teardown releases both surfaces.

## Thread labels at room scale

Below camera scale 1.15, desk plates show T3's title shortened at a word boundary (about 32 characters) in 14px Lexend, with the existing robot name underneath. Close views and hovered plates show the original full title. The full title remains in the tooltip and accessible label. No model writes labels.

## Questions that fit the monitor

The monitor question screen uses a compact 23px header, 18px question and 16px choices at the existing 820 by 461 logical screen size. Suppress descriptions that only repeat the option label. Keep Other and its text field on one row. Question content owns one scroll region for unusually long requests; a separate fixed footer keeps Send answer, approval controls and retry feedback visible. Preserve distinct descriptions, actual question text, selections, custom answers, keyboard focus, and the existing submission path. The sidebar answer card keeps its established typography and layout.

## Authored music moods and curation

Extend the existing song rows with plain genre, tempo and localized instrument text. Search covers instruments as well as titles and genres; avoid extra badges or a separate player. Mystical, medieval, detective and nostalgic directions join the electronic genres. Ambient pads and Bells & wonder filter by authored textures and gentle energy, rather than assuming every ambient piece sounds alike. Keep English/German controls, native selects, existing focus behavior and the same two shared streams.

The eleven-chapter journey uses active listening time, energy, related modal keys, half/double-time tempo and shared textures. Songs finish their written endings before a transition. Compatible bridge pieces can prepare a distant key or energy change. Constant measured playback trims match loudness while preserving arrangement dynamics. The library plays original encoded recordings; all sampling, native synth rendering and stem effects happen offline.

## Robot portrait alignment

Shared robot portraits use a square frame around the actual head and hat bounds with equal padding. Remove downward SVG offsets and oversizing. Center the portrait vertically beside the complete thread text block at every sidebar width.


## Question choice controls

Use native radio and checkbox inputs with custom Lucid visuals: a crisp lavender ring over the existing dark input surface, a peach center dot for a selected radio and a dark check on a peach selected checkbox. Unselected rows stay unboxed. The whole row activates its associated input through the label, while the custom text field keeps its own hit target. Retain compact row dimensions, visible keyboard focus, disabled semantics and native arrow-key behavior. Hover fills ease in over 130ms; selection draws over 160ms and pressing gently compresses the control. Reduced motion removes these transitions and compression; forced colors restores the platform control. Choices in the chat shelf and on desk monitors share this styling.

## Decorating and coins

Decorate is a right-side sheet with Floor, Walls, Computers and Things. Everything is free and unlocked; there is no shop, level or season gate. A computer choice dresses every desk in the room and replaces single-desk picks. Coins only show what work cost (one per dollar of API-priced work): each finished desk holds its coins until collected, and the counter in the zoom controls shows the total.

## Pinned threads

A thread pinned in T3 is an ordinary robot. Its desk carries a small round peach sticker with a pin, drawn like the other desk props, and its row leads the thread list with a small pin before the title. Pin and unpin from the desk menu or the row's context menu.

## Bottom-aligned answers

On a monitor showing one question, keep the question at the top and align its answer choices, including Other, to the bottom of the available content area just above the fixed Send footer. Keep at least 12px between the prompt and choices. Let long content overflow naturally into the existing content scroll region, and keep multiple questions in normal reading order. Chat-shelf question layout is unchanged.

## Sidebar header actions

The header starts with the product mark (`src/ui/brand-mark.ts`, a peach token) and the name from `src/brand.ts`; when the sidebar is too narrow for both the name and the actions, the name moves to an accessible label and the mark stays. Keep Office & settings, Help, Pin and Hide in one compact action group. Only the group absorbs spare header width. Its 30px buttons use 4px gaps, 6px corners, lavender icons and peach focus; visual order follows keyboard order. At narrow sidebar widths the whole group moves below the weather instead of spreading or wrapping individual icons. Long weather labels ellipsize within the header, retaining their full accessible text and existing tooltip. Update keeps its separate row. Hover feedback takes 130 ms and respects reduced motion.


## Tradebot chart jokes

The robot can use the existing Tradebot cursor to draw a dinosaur outline, circle a real candle as god-candle analysis, scribble spaghetti divergence or project a trust-me-bro rally. Keep the near-black exchange, actual candles and price axes intact. These are bounded canvas annotations stored separately from market data, with a compact Robot doodle caption and an absurd verdict typed after the drawing. The god-candle halo follows an actual candle; no fake candle or price spike is added to Bitcoin. Fictional coin trades keep their existing simulation. Stroke growth follows the one existing cursor and stops through the shared Kit when real work returns. Reduced motion shows the complete drawing and verdict immediately. Use existing click/typing feedback, robot focus and celebration, localization and render scheduling.


## Empty desk cleanup

Offices never create furniture automatically. An open office shows one faint Add a desk placeholder, a dashed ghost of a workstation (screen, stand and desk top with a small plus and label, in the `--wd-ghost-*` tokens), only while every desk in it is taken; an empty office shows it at the first desk place. It stands at the next snake place: after the last desk in a partly filled row, or directly below the end of a full row, which the room reserves. A vacant desk makes it redundant, and folded offices show none. Hover and focus brighten it in 140ms on cubic-bezier(.23,1,.32,1), a press compresses it to 97 percent, and keyboard focus shows the peach ring. The new desk assembles where the ghost stood (the top drops in, the monitor rises, about 370ms) with the shared build cue; repeat presses wait until that desk stands. A job that takes a deliberately added spare consumes that spare instead of cloning another empty workstation. Reservations for active work, unanswered questions, review, charging and in-flight hires remain authoritative. Truly vacant desks have a quiet 30px close control at the monitor corner, peach keyboard focus and a 130ms press response. Occupied desks never show that control. The desk and office menus offer guarded removal, including all eligible empty desks in that office; no threads or workers are deleted. Removing the last desk returns the placeholder to the first place. Reuse the existing safe floor-layout transition, shared switch cue and saved environment layout. Reduced motion removes the control and placeholder transforms and the build motion; the cue still plays.

## Compaction update screen

An active root compaction event for the robot's current T3 run covers its complete monitor with a Windows-style blue update screen. Keep Lexend, centered white compaction text and five small orbiting dots. Say Compacting context and Please don’t turn off your robot; never invent a percentage, elapsed estimate or completion stage. The desktop and its state remain mounted, and the compaction overlay owns coverage independently of plan, question and completion screens. Human questions and explicitly opened plans keep priority. Start and finish follow real item and run statuses immediately, outside cosmetic playback. Old turns, nested helpers and stale running snapshots cannot trigger or reopen the screen. A stopped, failed or finished run dismisses it. Reuse the shared quiet switch cue on live entry/exit. CSS dot motion pauses offscreen and hidden; reduced motion leaves a static five-dot ring. English/German controls update in place.


## Arcade picture alignment

The break-room TV has a fixed 24 by 10 SVG inset and a 152 by 86 picture. Keep that placement in an outer viewport group and draw each boot/game scene in its own inner group. Screen shakes and other game effects only transform the inner scene, returning to its local zero. They must never overwrite the TV inset or leave a black strip after a hit. Preserve the existing fighting game, kart race, bezel, power controls and animation ownership.


## Monitor desktop coverage

Full-screen plan, question, report and compaction views own desktop coverage through the existing window manager. Hide the mounted desktop window layer, dock, wallpaper, clock, transient surfaces and simulated pointer while any owner remains. Keep app geometry and state intact, make the desktop window layer and dock inert, and restore their visibility and keyboard access only when the last owner closes. Overlay windows retain their existing priorities and opaque surfaces. No desktop chrome should bleed through a full-screen plan.


## Lucid media player

Chat audio/video and attachment previews share a custom player over native media decoding. Preserve navy/lavender surfaces, peach playback controls, Lexend, restrained 8px corners and tabular time. A quiet filename sits above a full-width seek track; the toolbar holds play/pause, elapsed/duration, mute, volume, speed and video fullscreen. Controls stay visible, and narrow players reduce spacing before hiding the volume slider. Never invent a waveform or progress. Actual media events drive playing, buffering, errors and time; playback starts only by user action. One clip plays at a time. Existing exact-original downloads remain available. Focusable ranges, keyboard playback/seeking, English/German labels, visible focus, retry and reduced-motion states are shared. Opening/closing previews retains the native dialog behavior; removed players pause and release media/listeners. Reparented conversation rows retain their players. Media provides its own audio feedback, without added click sounds over recordings. Local media streams and remote media buffers serve accurate byte ranges, Content-Length, content types, suffix requests and unsatisfiable-range errors, so native decoding and seeking work through the existing authenticated file boundary.

## Interface themes

Office & settings has an Interface choice next to Game language, built from `src/themes/registry.ts`: Night blue (default) and OLED black. Every themed colour is a token (`src/themes/tokens.css`, defaults are the night look) applied by `src/themes/surfaces.css`; a theme file only sets token values. See `docs/themes.md` for adding a theme or a surface.

OLED black uses neutral surfaces with no blue cast: #000 panels and chat, #161616 menus and dialogs, #0d0d0d fields and code, ink #ececec / #b4b4b4 / #8c8c8c, white 11% hairlines that keep edges visible. The office is midnight at every hour (the wall clock keeps real time) under a black sky, with black night tints, a deeper indoor shade so lamps and monitors carry the light, and a moonlit season palette (same hues, 78% toward black) that fades into pure black at the map edge. Cloud shadows are hidden because they are lighter than black. Rooms get dark oak floors (#3b2a1e) and desks (#4e3523 top, #2f2016 front), warm charcoal walls (#1d1b1a), near-black frames, casings and corridors, and dark room signs, nameplates and Add a desk placeholders; purchased floors, walls and casings keep their look. Robots turn dark in their own hue, with managers more strongly tinted and keeping their crowns. Wallpapers are true black with two light pools in the robot's colours and a soft silver brand mark. Robot computers turn black too, including the paper notepad flavour, notes apps, the robot browser's own chrome and Lucid's office suite; each robot's wallpaper hue remains as a low glow. Peach actions, mint, provider colours and brand apps stay. Switching crossfades in 260ms on the strong ease-out; reduced motion switches instantly.

## Status vocabulary

One vocabulary for a thread's operational state, defined once in `src/ui/status.ts` (`STATUS`, `statusBadge`, `statusIcon`) and resolved from real T3 data by `threadState` in `src/office/thread-state.ts`. Each status has exactly one icon, one colour token and one word:

| Status | Word | Icon | Token |
| --- | --- | --- | --- |
| working | Working | dashed ring that turns slowly | `--status-working` (blue #6fb6ff) |
| needs | Needs you | ring with an attention mark | `--status-needs` (gold #ffd27a) |
| done | Done | ring with a check | `--status-done` (mint #4fd18b) |
| settled | Settled | archive tray | `--status-settled` (ink-3) |

Queued runs, background jobs and Orchestrator review steps are Working; questions, failed runs, failed jobs and manual review are Needs you; approved work is Done; collected work is Settled. Stopped or untouched threads have no status and show their time. The reason ("Run failed", "Queued", "Waiting for Orchestrator review") goes in the tooltip, and the chat header adds it after the word ("Needs you · Run failed"), so the word itself never varies. Thread rows, the folded rail dot, the chat header and the monitor completion chip all render through the same helper, so Done looks identical everywhere. Active rows use a restrained 5% tint of the status colour; selection keeps its neutral highlight. Working titles use muted neutral white #bfc1c8, quiet titles #ececec. Reading a reply never clears Done; only a new run or collection changes it. Reduced motion, hidden windows and rows scrolled out of view stop the working ring. Preserve thread order, authored titles, keyboard focus and artwork in both Night blue and OLED.

## Sidebar thread flow

Active conversations own the sidebar's scroll region. Settled stays at its bottom, immediately above Subscriptions, with matching compact 36px disclosure headers, lavender text, hairlines and peach focus. Each expanded lower section has a bounded content scroller, keeping both headers reachable. Completed conversations lead their group newest first; all other rows retain T3 order. During pointer interaction, defer reorder while still updating status text. Preserve row and spinner nodes across refreshes, with state-preserving DOM moves for reordering. Camera movement pauses scene decorations only, never sidebar status animations. Keep the shared calm, hidden and reduced-motion policies.

## Limits disclosure

Limits is its own saved disclosure below Subscriptions, sharing the same 36px header, full-row toggle, lavender text, hairline and peach focus. Move the existing live provider rows and their availability note into this section; never duplicate polling or reset the disclosure as readings arrive. Preserve the compact meters, percentages and reset tooltips. Long provider names ellipsize, narrow sidebars stack the meters, and the expanded body has a bounded scroll region.

## Latest prompt context

The conversation keeps a compact two-line view of the latest submitted user prompt at the top of the transcript when its original bubble is outside the viewport. Queued drafts never replace it. Use the existing raised surface, readable ink, peach return arrow and 8px lower corners. Clicking or keyboard-activating it returns focus to the original message. It overlays the transcript without changing its geometry or reading position, clears on thread changes and leaves the composer untouched. Full prompt text stays available on hover and in the original bubble. Done is a stationary mint check: discard canceled work animations from the shared pause controller before stepping or resuming them.

## Selected thread and shared status

Keep the current conversation visibly selected with an inset outline and softly tinted surface in its status colour (mint for Done, blue for Working, gold for Needs you, neutral for idle), in expanded rows and the folded rail. Expose the same selection with aria-current and update it immediately for desk, robot and thread navigation, retaining it while the chat is folded. The chat status uses the same resolver and status helper as the sidebar, including Done after reading. Fictional leisure activity must never replace the task status. Sending is queued only while a run is working or queued, not merely because its background job continues.

## Sidebar settlement

Eligible active threads show the shared Done status (src/ui/status.ts) in the status position. Hover or keyboard focus replaces the status with the interface check icon and a gray Settle action that brightens to white on hover, matching T3 Code; touch devices show the action directly. Coin amounts remain in the tooltip and accessible action name. Reuse desk eligibility, review approval and collection behavior. Keep the action separate from navigation, disable it during settlement, and show recoverable errors inline.

## Window chrome

There is no separate title bar. The sidebar header, the chat header and the folded rails share one 52px chrome row (`--chrome-h`); their empty parts drag the window and a double click maximizes it, as on a native title bar. Every control inside those areas, the resize grips and every menu, dialog or popover opts out of dragging. The office scene keeps its own camera drag. The window title comes from `electron/brand.cjs`; page titles never replace it.

- Linux (frameless): minimize, maximize or restore, and close sit in the top right corner on the chrome row, after a hairline separator from the chat actions. Each button's hit area is the full row height and the close button's reaches the screen corner; the visible face is a 30px, 6px-corner square that fills with ink at 10% on hover and presses to 94%, the close face turns `--ui-close` red with a white icon, and keyboard focus draws the peach ring. Icons are the interface set's minimize, maximize, restore and close.
- macOS: `titleBarStyle: hiddenInset` with the traffic lights centred on the chrome row at x 16; the sidebar header keeps 84px of left padding for them (`--wc-left`), and the folded rail starts below them.
- Windows: native caption buttons in a 52px `titleBarOverlay`. The renderer keeps headers clear of the overlay's measured width (`--wc-right`) and recolours it from the surface beneath (the chat surface, or the rail colour when the chat is folded) and `--ink-2`, following theme switches and folding.
- When the column under the controls is folded into its rail, a small plate in the rail's colour with one rounded inner corner holds the controls over the office, and it steps back while a panel peeks. A chat narrower than 470px moves its header actions to a second line so the title stays readable beside the controls. Full screen hides the controls and their reserved space.

Hover and press take 120ms on the strong ease-out; reduced motion removes the transitions and press scale.

## Interface icons

The app's own interface draws every icon from `src/ui/icons.ts` (`icon(name, size)`): a 16 unit grid, a 1.5px stroke kept at every size with `vector-effect: non-scaling-stroke`, round caps and joins, 2 unit corners on boxes and stroke-dot details. Sizes are 16 for header and icon buttons, 14 inline with text and 12 for chevrons. Icons are decorative (`aria-hidden`) unless given a label; the button carries the accessible name. The set covers window and panel controls, actions (settings, help, search, plus, check, edit, steer, attach, send, grip), direction, things (screen, studio, chat, terminal, tool, agent, file, image, checklist, coin, users, bolt), media controls and the four status icons. Robot computer apps keep their own art in `src/os/icons.ts`; harness and brand logos stay authentic images. Add a missing icon to the set instead of drawing one inline.

## Shared controls

Buttons, icon buttons, menus and fields share `src/ui/controls.css` and the tokens in `src/styles.css`: spacing `--space-1` to `--space-5` (4, 8, 12, 16, 24px), radii `--radius-sm` 6px (buttons, icon buttons, menu items, chips), `--radius-md` 8px (fields, code, tables), `--radius-lg` 10px (menus, with items concentric at 4px padding) and `--radius-xl` 14px (dialogs and the composer), `--control-h` 32px, `--icon-btn` 30px, `--shadow-pop`, and the motion curves `--ease-out`, `--ease-out-strong`, `--ease-in`, `--ease-in-out` with `--dur-press` 120ms, `--dur-hover` 130ms and `--dur-sm` 180ms. Primary buttons are peach, ghost buttons a 7% ink fill, both press to 97%; icon buttons are transparent 30px squares that fill with 9% ink on hover and press to 94%. Every focus ring in the interface is peach. Base rules sit in `:where()` so a feature's own size or placement wins. The composer's attach and send buttons sit at one 8px inset with 6px corners, concentric with its 14px box. Chat tables never break words mid-word: columns size to content, paths may wrap after their slashes, GFM alignment is kept, and a table wider than the chat scrolls sideways inside its frame.
