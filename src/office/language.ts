import { getLocale, setLocale, onLocaleChange } from "../localization";

/** One game-wide preference, independent of the orchestrator and real thread content. */
export type LinesWriter = { busy: boolean; current: boolean; regenerate(): Promise<void> };
/** `writer`: rewrites the robots' daily lines, for example after switching language. */
export function mountLanguageSetting(parent: HTMLElement, writer: () => LinesWriter | null = () => null): () => void {
  const row = document.createElement("label");
  row.className = "game-language";
  const caption = document.createElement("span");
  const select = document.createElement("select");
  select.id = "game-language";
  for (const [value, label] of [["en", "English"], ["de", "Deutsch"]]) {
    const option = document.createElement("option");
    option.value = value; option.textContent = label; select.appendChild(option);
  }
  const rewrite = document.createElement("button");
  rewrite.type = "button"; rewrite.className = "link-btn game-language-rewrite";
  const status = document.createElement("span");
  status.className = "game-language-status"; status.setAttribute("role", "status");
  const paintRewrite = () => {
    const w = writer(), de = getLocale() === "de";
    rewrite.hidden = !w;
    rewrite.disabled = !!w?.busy;
    rewrite.textContent = w?.busy ? (de ? "Roboter schreiben..." : "Robots are writing...") : (de ? "Robotertexte neu schreiben" : "Rewrite robot lines");
    rewrite.title = de ? "Neue Dialoge, Chats und Videotitel aus den Personas in dieser Sprache" : "New dialog, chats and video titles from the personas, in this language";
  };
  rewrite.addEventListener("click", async () => {
    const w = writer(); if (!w || w.busy) return;
    const de = getLocale() === "de";
    status.textContent = ""; const run = w.regenerate(); paintRewrite();
    await run; paintRewrite();
    status.textContent = w.current ? (de ? "Neue Texte sind da." : "New lines are ready.") : (de ? "Das hat nicht geklappt. Später erneut versuchen." : "That did not work. Try again later.");
  });
  const update = () => {
    paintRewrite();
    select.value = getLocale();
    caption.textContent = getLocale() === "de" ? "Spielsprache" : "Game language";
    select.title = getLocale() === "de" ? "Dialoge und simulierte Apps" : "Dialogue and simulated apps";
    select.setAttribute("aria-label", caption.textContent);
  };
  select.addEventListener("change", () => { if (select.value === "en" || select.value === "de") setLocale(select.value); });
  row.append(caption, select); parent.appendChild(row);
  const tools = document.createElement("div"); tools.className = "game-language-tools"; tools.append(rewrite, status);
  parent.appendChild(tools); update();
  const stop = onLocaleChange(update);
  return () => { stop(); row.remove(); tools.remove(); };
}
