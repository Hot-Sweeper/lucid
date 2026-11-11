# Interface themes

The app's interface, office lighting and robot computers are themed together. Follow T3 is the default when T3 Code's theme can be read; Night blue is the default otherwise; OLED black is the third theme.

## How it fits together

- `src/themes/registry.ts` lists the themes: id, English and German label, window colour and how the office world is lit and drawn (`alwaysMidnight`, `nightSky`, `artShade` for a moonlit palette, `mapEdge` for the colour the woodland fades into).
- `src/themes/tokens.css` defines every themed colour as a token. The defaults are the night look, exactly as the components drew it.
- `src/themes/surfaces.css` applies the tokens to the app's chrome, the office lighting and the robot desktop apps. Its `html:root[data-theme]` prefix outranks each component's own colour rule, including stylesheets that load later with their app.
- `src/themes/<id>.css` sets token values on `:root[data-theme="<id>"]` and nothing else.
- `src/interface-theme.ts` applies the saved theme before the interface is built, builds the Interface selector in Office & settings from the registry, and crossfades switches with View Transitions (instant under reduced motion). The world relights on the `lucid:interface-theme` event.

## Follow T3

Follow T3 copies the theme active in T3 Code. T3 has no API or file for the active choice (its environment theme in `settings.json` and `themes/` is only a default it pushes to clients), so `electron/t3-theme.cjs` reads T3's own window storage, read-only: the Chromium Local Storage folder `<appData>/t3code-v2/Local Storage/leveldb` (origin `t3code://app`, keys `t3code:theme`, `t3code:theme-appearance-mode`, `t3code:theme-follow-system`, `t3code:theme-halves:v1`, `t3code:themes:v1`) through `electron/chromium-local-storage.cjs`. It never locks or writes the database and returns nothing on a missing folder, an unknown format or a compaction in progress. Without that folder it uses T3's environment theme (`~/.t3/userdata/settings.json` `defaultTheme` and `~/.t3/userdata/themes/*.json`).

The resolution mirrors T3's web client: the theme id, appearance mode, light and dark halves, custom themes (missing colours from T3 Chat) and the system appearance. Built-in palettes come from `electron/t3-theme-builtins.cjs`, a copy of T3's table; a built-in that a newer T3 adds falls back to T3's default palette until that table is refreshed. Colours are converted to sRGB hex, and text, muted text, link accent and accent ink are lifted to WCAG AA.

`src/themes/t3-theme.ts` sets the palette as `--t3-*` on `<html>` with `data-t3-appearance`, keeps the last palette in localStorage for the next launch, and checks again every 8 seconds while the window is visible and Follow T3 is in use (one check at a time, again on focus). The main process answers from a cache while the files' sizes and times are unchanged. `src/themes/t3.css` maps those colours onto the tokens (including `--accent` and `--accent-ink`, so every interactive accent follows T3) and gives the office a gentler night tint; the robots' dark computer apps from `oled.css` also apply under a dark T3 theme, but OLED's moonlit office (materials, dark robots, black map edge) does not. `registry.ts` updates the Follow T3 entry's window colour and app scheme; its world always keeps the warm season art and real time-of-day light.

## Light palettes

The interface was drawn for dark panels, so a few core tokens in `src/styles.css` (and `--thread-*` in `office/thread-state.css`, `--cw-*` in `office/chat-work.css`) carry the colours a light palette must change: `--wash` (the colour of translucent hover and selection fills, written `color-mix(in srgb, var(--wash) N%, transparent)`; white by default), `--ink-hi` (the strongest text), `--coin-ink`, `--link`, `--link-hover`, `--danger-ink` and `--mono-logo-filter` (one-colour harness logos are drawn white; a light palette darkens them). The light block of `t3.css` sets them; a future light theme sets the same tokens. New interface rules use these tokens instead of fixed light colours such as `rgba(255, 255, 255, .08)`, `#fff` or `#ffd27a`.

## Office materials

Room art, desks and labels read `--wd-*` tokens: `--wd-frame`, desk wood (`--wd-desk-top`, `--wd-desk-front`, `--wd-desk-sheen`), keyboard and keys, the classic computer casing (`--wd-bezel`, `--wd-bezel-edge`), corridor (`--wd-hall-*`), room name cards (`--wd-sign`, `--wd-sign-ink`), desk nameplates (`--wd-plate*`) and the Add a desk placeholder (`--wd-ghost-line`, `--wd-ghost-fill`, `--wd-ghost-ink`). Floors, walls and trim differ per room type, so `--wd-floor`, `--wd-seam`, `--wd-wall`, `--wd-trim`, `--wd-tile` and `--wd-tile-seam` have no default: each room keeps its own colour unless a theme sets them. Office chairs read `--wd-chair*`. The free starter materials (Honey planks, Warm white) follow these tokens; purchased floors and walls keep their pattern under `--wd-bought-shade` (0 by default), and computer casings keep their look. The shop resets these tokens so previews show materials as sold. SVG art uses `style="fill:var(--token, original)"` because a var() cannot sit in a fill attribute.

## Robots and wallpapers

Robot bodies come from `bodyColors()` in `src/robot/look.ts`: each body colour is a `color-mix()` between the light body and a dark one tinted with the robot's own hue, weighted by `--robot-dark` (0% in Night blue, 100% in OLED). `--robot-tint` sets the hue strength. `--shell`, `--shade` and `--deep` are registered with `@property` so computed styles and canvas robots get resolved colours. Accessories have both looks too: fabric in the robot's accent uses `--acc-cloth` (the accent deepened by `--acc-dark`), and fixed materials read `--acc-ink`, `--acc-card`, `--acc-metal*`, `--acc-leather*`, `--acc-robe*` and `--acc-silk*` with their original colours as fallbacks. Crown gold, the propeller hat, santa, chef and flower pieces look the same in both. Wallpapers take a veil (`--os-veil`) with holes cut by `--os-veil-mask`, plus `--os-logo-opacity` and `--os-logo-filter` for the brand mark.

## Apps on the robots' computers

Each app has a light look (its own stylesheet) and a dark look in `src/themes/app-dark/` (`web.css` for browser pages, `social.css` for the social and pastime apps, `apps.css` for the office suite and the rest). The theme's `appScheme` puts `data-app-scheme` on `<html>`, and dark rules are prefixed `html:root[data-app-scheme="dark"]`. Branded replicas follow the real product's dark mode (WhatsApp, Telegram, Gmail, Duolingo, GitHub, Google search, Wikipedia, Office Black); the app-original apps use neutral near-black surfaces. A new app adds its dark rules there.

## Adding a theme

1. Add an entry to `THEMES` in `registry.ts`.
2. Create `src/themes/<id>.css` with the token values that differ from the defaults, and import it in `registry.ts`.
3. That is all: the selector lists it, and every themed surface follows.

## Adding a new surface

Give a new panel, dialog or desktop app colours from existing tokens. If it needs its own colour, add a token with the night value to `tokens.css`, use it in `surfaces.css` or directly in the component, and set it in each theme file. Brand apps and site replicas (Botflix, Botify, harness apps, GitHub-style pages, Steam, games) keep their own palettes on purpose.

## Checking

Compare computed colours of the default theme against the previous build (they must match) and screenshot the new theme in the isolated `LUCID_SHOT` fixture, including the office at full zoom-out and a robot's monitor with windows open.
