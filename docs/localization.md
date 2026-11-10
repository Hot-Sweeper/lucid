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
unchanged names and protected tokens. All 28 classic jokes also have authored
German pairs, available without a model.

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
node scripts/verify-localization.cjs
node scripts/verify-localization-client.mjs
node scripts/verify-localization-dom.cjs
node scripts/verify-flavor-localization.cjs
node scripts/verify-localization-speech.mjs
node scripts/verify-localization-canvas.mjs
npm run verify:update
```

The deterministic suites use model fixtures. Native acceptance uses
`scripts/render-language-review.cjs`, a private production build and a separate
fixture bundle of the real game modules, with the production main process,
preload, IPC handler and live headless writer. Its automated host holds the apps
steady for paired captures. Provider discovery can be made unavailable to test
the actual service's cooldown and recovery; model responses are never replaced.
Generated-pack inputs are explicitly recorded, using a real daily pack when
available and a deterministic representative pack otherwise.

Build and run this only in a private snapshot and an available native slot:

```
npm run verify:update
npx vite build --config vite.language-review.config.mjs
node scripts/render-language-review.cjs <absolute-evidence-directory>
```

`LUCID_LANGUAGE_CACHE_ONLY=1` with `LUCID_SHOT_PROFILE` pointing at the previous
isolated profile checks native process restart persistence without requesting a
new translation. Evidence records the actual production assets, source manifest,
model selections, test outcomes and paired native screenshots. Translation quality
across every possible generated scene still requires editorial judgment.

## Review evidence, 2026-10-31

Status: delivered for user review, remains unsettled.

The real IPC review fixed a rejected helper launch request, canonical English restoration, retry of fallback DOM text, and explicit runtime window titles. The canvas pass adds German video exchanges, dance/parody thumbnail hooks, meme/GIF captions, show subtitles, ribbons, credits and selected signs. Text translates before measuring and wrapping. Brand artwork, code, handles and names remain authored.

The private snapshot is `E:/Lucid-validation/language-final-MaAWQr`. It includes the current sidebar startup delay fix (1500 to 0), preserving later chat, roster, artwork and performance work. `verify:update` and all six localization suites pass. Native acceptance passed 23 assertions through the production main/preload/IPC path, two process-restart assertions, and three supplemental generated-capture assertions. Successful native runs and the delivery proof have no captured runtime errors.

The representative apps are actual game modules hosted in a native fixture, with activity paused for stable paired captures. BotsApp shows an opened family conversation. Generated-pack acceptance used the recorded deterministic input because no daily orchestrator pack was available. Only that input handler is replaced; translation IPC, provider discovery, launch and model output remain real. Warm app cache entries came from preceding real native model calls. The outage/recovery string was deliberately uncached. The final acceptance launched four Luna low helpers; the native restart launched none.

The [source manifest](E:/Lucid-validation/language-final-MaAWQr/dist/lucid-build.json) and [loaded proof](E:/Lucid-validation/language-final-MaAWQr/evidence/loaded-build-proof.json) identify production `index-CMonRVNT.js`, SHA256 `7ef6e0ecb1b9c69ebc3b6e7ccc6e090c3b05c6e07db3f26e49c3884bfc618522`. Debugger source equals installed bytes. Main PID 447708 rendered 15 rooms with `document.hidden=false`; `sourceMatches` was empty. All 95 dist files match the verified snapshot. The previous dist remains at `E:/T3 Projects/Lucid/.lucid-language-previous-1793470619578`. A single-instance activation restored the same production window. The user's language preference was restored after checking the selector.

| Capture | English | German |
| --- | --- | --- |
| BotTube and canvas thumbnails | [Before](E:/Lucid-validation/language-final-MaAWQr/evidence/BotTube-en.png) | [After](E:/Lucid-validation/language-final-MaAWQr/evidence/BotTube-de.png) |
| Botcord messages | [Before](E:/Lucid-validation/language-final-MaAWQr/evidence/Botcord-en.png) | [After](E:/Lucid-validation/language-final-MaAWQr/evidence/Botcord-de.png) |
| Open BotsApp chat | [Before](E:/Lucid-validation/language-final-MaAWQr/evidence/BotsApp-en.png) | [After](E:/Lucid-validation/language-final-MaAWQr/evidence/BotsApp-de.png) |
| Incidental speech and joke | [Before](E:/Lucid-validation/language-final-MaAWQr/evidence/Speech-en.png) | [After](E:/Lucid-validation/language-final-MaAWQr/evidence/Speech-de.png) |
| Runtime window titles | [Before](E:/Lucid-validation/language-final-MaAWQr/evidence/Titles-en.png) | [After](E:/Lucid-validation/language-final-MaAWQr/evidence/Titles-de.png) |
| Canvas meme | [Before](E:/Lucid-validation/language-final-MaAWQr/evidence/Canvas-en.png) | [After](E:/Lucid-validation/language-final-MaAWQr/evidence/Canvas-de.png) |
| Generated-pack exchange | [Before](E:/Lucid-validation/language-final-MaAWQr/generated-evidence/Generated-en.png) | [After](E:/Lucid-validation/language-final-MaAWQr/generated-evidence/Generated-de.png) |
| Installed game setting | [Before](E:/Lucid-validation/language-final-MaAWQr/evidence/production-setting-en.png) | [After](E:/Lucid-validation/language-final-MaAWQr/evidence/production-setting-de.png) |

The generated links supersede initial captures taken before the updated frame was painted. Screenshot pixels were not redrawn or edited. German controls and paragraphs passed measured horizontal-overflow checks. Existing feed-title ellipsis remains in place.

Raw records: [native checks](E:/Lucid-validation/language-final-MaAWQr/evidence/native-result.json), [native restart](E:/Lucid-validation/language-final-MaAWQr/restart-evidence/native-restart.json), [generated captures](E:/Lucid-validation/language-final-MaAWQr/generated-evidence/generated-captures.json), [setting state/geometry](E:/Lucid-validation/language-final-MaAWQr/evidence/production-setting.json), and [required verification log](E:/Lucid-validation/language-final-MaAWQr/verify-update.log).

The same delivered build includes corrected real-chat behavior. The [chat inclusion record](evidence/robot-chat-review/corrected-chat-loaded-provenance.json) reuses existing native chat results and the loaded proof. It does not claim a new live chat test. Later file changes were preserved and the retained chat behavior was checked directly.
