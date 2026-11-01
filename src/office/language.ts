import { getLocale, setLocale, onLocaleChange } from "../localization";

/** One game-wide preference, independent of the orchestrator and real thread content. */
export function mountLanguageSetting(parent: HTMLElement): () => void {
  const row = document.createElement("label");
  row.className = "game-language";
  const caption = document.createElement("span");
  const select = document.createElement("select");
  select.id = "game-language";
  for (const [value, label] of [["en", "English"], ["de", "Deutsch"]]) {
    const option = document.createElement("option");
    option.value = value; option.textContent = label; select.appendChild(option);
  }
  const update = () => {
    select.value = getLocale();
    caption.textContent = getLocale() === "de" ? "Spielsprache" : "Game language";
    select.title = getLocale() === "de" ? "Dialoge und simulierte Apps" : "Dialogue and simulated apps";
    select.setAttribute("aria-label", caption.textContent);
  };
  select.addEventListener("change", () => { if (select.value === "en" || select.value === "de") setLocale(select.value); });
  row.append(caption, select); parent.appendChild(row); update();
  const stop = onLocaleChange(update);
  return () => { stop(); row.remove(); };
}
