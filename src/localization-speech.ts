import { canonicalText, getLocale, onLocaleChange, translateEntries, uiText } from "./localization";
import { authoredLine } from "./lines/catalog";

/** Opt in only for fictional speech. Authored lines (src/lines) switch language directly; other
 *  lines go to the translator. Late model replies never resurrect expired bubbles. */
export function flavorSpeech(paint: (text: string) => void) {
  let source: string | null = null, version = 0, dead = false;
  const update = () => {
    const text = source, revision = ++version, language = getLocale();
    if (dead || !text) return;
    const own = authoredLine(text, language);
    if (own) { paint(own); return; }
    paint(uiText(text));
    if (language === "en" || document.hidden) return;
    void translateEntries([{ id: "speech", text, context: "Incidental robot speech in Lucid's park or break room. Preserve the character's voice, adapt wordplay naturally. Already German lines should remain unchanged." }], language).then(entries => {
      if (!dead && revision === version && language === getLocale() && source === text) paint(entries[0]?.text ?? text);
    }).catch(() => {});
  };
  const stop = onLocaleChange(update);
  return {
    show(text: string | null) { source = text ? canonicalText(text) : null; update(); },
    destroy() { dead = true; source = null; version++; stop(); },
  };
}
