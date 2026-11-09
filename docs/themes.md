# Interface themes

Lucid's interface, office lighting and robot computers are themed together. Night blue is the default; OLED black is the second theme.

## How it fits together

- `src/themes/registry.ts` lists the themes: id, English and German label, window colour and how the office world is lit and drawn (`alwaysMidnight`, `nightSky`, `artShade` for a moonlit palette, `mapEdge` for the colour the woodland fades into).
- `src/themes/tokens.css` defines every themed colour as a token. The defaults are the night look, exactly as the components drew it.
- `src/themes/surfaces.css` applies the tokens to Lucid's chrome, the office lighting and the robot desktop apps. Its `html:root[data-theme]` prefix outranks each component's own colour rule, including stylesheets that load later with their app.
- `src/themes/<id>.css` sets token values on `:root[data-theme="<id>"]` and nothing else.
- `src/interface-theme.ts` applies the saved theme before the interface is built, builds the Interface selector in Office & settings from the registry, and crossfades switches with View Transitions (instant under reduced motion). The world relights on the `lucid:interface-theme` event.

## Office materials

Room art, desks and labels read `--wd-*` tokens: `--wd-frame`, desk wood (`--wd-desk-top`, `--wd-desk-front`, `--wd-desk-sheen`), keyboard and keys, the classic computer casing (`--wd-bezel`, `--wd-bezel-edge`), corridor (`--wd-hall-*`), room name cards (`--wd-sign`, `--wd-sign-ink`), desk nameplates (`--wd-plate*`) and the Add a desk button (`--wd-add*`). Floors, walls and trim differ per room type, so `--wd-floor`, `--wd-seam`, `--wd-wall`, `--wd-trim`, `--wd-tile` and `--wd-tile-seam` have no default: each room keeps its own colour unless a theme sets them. Office chairs read `--wd-chair*`. The free starter materials (Honey planks, Warm white) follow these tokens; purchased floors and walls keep their pattern under `--wd-bought-shade` (0 by default), and computer casings keep their look. The shop resets these tokens so previews show materials as sold. SVG art uses `style="fill:var(--token, original)"` because a var() cannot sit in a fill attribute.

## Robots and wallpapers

Robot bodies come from `bodyColors()` in `src/world/look.ts`: each body colour is a `color-mix()` between the light body and a dark one tinted with the robot's own hue, weighted by `--robot-dark` (0% in Night blue, 100% in OLED). `--robot-tint` sets the hue strength for workers and `--robot-mgr-tint` for managers, whose obsidian finish becomes a stronger tint under a dark theme. `--shell`, `--shade` and `--deep` are registered with `@property` so computed styles and canvas robots get resolved colours. Wallpapers take a veil (`--os-veil`) with holes cut by `--os-veil-mask`, plus `--os-logo-opacity` and `--os-logo-filter` for the brand mark.

## Adding a theme

1. Add an entry to `THEMES` in `registry.ts`.
2. Create `src/themes/<id>.css` with the token values that differ from the defaults, and import it in `registry.ts`.
3. That is all: the selector lists it, and every themed surface follows.

## Adding a new surface

Give a new panel, dialog or desktop app colours from existing tokens. If it needs its own colour, add a token with the night value to `tokens.css`, use it in `surfaces.css` or directly in the component, and set it in each theme file. Brand apps and site replicas (Botflix, Botify, harness apps, GitHub-style pages, Steam, games) keep their own palettes on purpose.

## Checking

Compare computed colours of the default theme against the previous build (they must match) and screenshot the new theme in the isolated `LUCID_SHOT` fixture, including the office at full zoom-out and a robot's monitor with windows open.
