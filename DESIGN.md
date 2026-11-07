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
