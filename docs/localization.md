# Game language

Choose English or Deutsch in the sidebar's Office & tools disclosure. English is
the default. The choice persists locally and applies without restarting.

The setting covers game flavor, including written content packs, daily
orchestrator dialogue, built-in jokes, fictional entertainment feeds and phone
chats, and simulated computer app labels. Real thread conversations, code,
terminal output, user inputs, robot names, channel IDs and brand names stay as
authored. This is not a translation of the entire work-management interface.

German dialogue comes from the headless writer (`electron/headless-writer.cjs`):
an installed harness CLI run without tools on its cheapest suitable model, never
a T3 thread. Translation instructions request natural informal German,
matching alternatives for wordplay, coherent exchanges, concise controls, and
unchanged names and protected tokens. The robots' built-in base set of short
remarks, the 28 classic jokes and the question-line small talk have authored German
pairs in `src/lines/catalog.ts`, available without a model; event lines about real
T3 activity are authored templates in both languages (`src/lines/events.ts`). Speech
bubbles switch authored lines between languages directly.

The backend validates responses and persists at most 4,000 translations. Matching
requests share pending work; model requests are serialized and pending entries
are bounded. A failure leaves the English text usable and applies a cooldown.
Known wordplay can have an authored override. For example, "Nice to bit you."
becomes "Du bist ganz mein Datentyp." rather than losing the joke.
The renderer and DOM adapter have separate bounded caches and stale-result
guards. DOM observers only translate fictional surfaces while visible, and
disconnect when the owning app is destroyed.

Written packs are selected using canonical English identity, so changing the
language does not restart repetition history. Selected scenes and the next scene
warm lazily. An uncached scene can initially appear in English. Daily generated
packs wait for translation before publishing. Text painted directly into canvas
uses a separate, authored German canvas catalog. Video exchanges, meme and GIF
captions, dance/parody thumbnail hooks, show subtitles, selected signs, ribbons
and credits translate before text measurement or wrapping. Code, handles,
hashtags, brand names and title artwork stay authored. Static canvases repaint
on language changes using weak ownership, without model calls in drawing loops.
Park and break-room actors opt
their incidental speech into a separate adapter. It keeps the existing bubble
lifetime, refits translated text, discards stale replies, and releases its
language listener when the actor is destroyed. Real question-line actors do not
opt in. Uncached short remarks may expire before a model reply arrives; their
translations remain cached for later appearances.

Verification:

```
node scripts/checks/verify-localization.cjs
node scripts/checks/verify-localization-client.mjs
node scripts/checks/verify-localization-dom.cjs
node scripts/checks/verify-flavor-localization.cjs
node scripts/checks/verify-localization-speech.mjs
node scripts/checks/verify-localization-canvas.mjs
npm run verify:update
```

The deterministic suites use model fixtures. Native acceptance uses
`scripts/review/render-language-review.cjs`, a private production build and a separate
fixture bundle of the real game modules, with the production main process,
preload, IPC handler and live headless writer. Its automated host holds the apps
steady for paired captures. Provider discovery can be made unavailable to test
the actual service's cooldown and recovery; model responses are never replaced.
Generated-pack inputs are explicitly recorded, using a real daily pack when
available and a deterministic representative pack otherwise.

Build and run this only in a private snapshot and an available native slot:

```
npm run verify:update
npx vite build --config dev/vite.config.mjs
node scripts/review/render-language-review.cjs <absolute-evidence-directory>
```

`LUCID_LANGUAGE_CACHE_ONLY=1` with `LUCID_SHOT_PROFILE` pointing at the previous
isolated profile checks native process restart persistence without requesting a
new translation. Evidence records the actual production assets, source manifest,
model selections, test outcomes and paired native screenshots. Translation quality
across every possible generated scene still requires editorial judgment.
