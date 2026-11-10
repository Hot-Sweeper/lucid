// Event lines: what a robot says about real T3 activity. Every detail in a line comes from
// the fact it was given (a thread title, measured minutes, parsed test counts, an exit code,
// the boss's actual answer). A template is used only when all of its slots are known, so a
// line never claims anything the T3 data does not show.

export type LineFact =
  | { kind: "finished"; title: string; minutes?: number }
  | { kind: "stopped"; title: string }
  | { kind: "question"; title: string }
  | { kind: "longRun"; title: string; minutes: number }
  | { kind: "settled"; title: string }
  | { kind: "tests"; exit: number; passed?: number; failed?: number }
  | { kind: "report"; title?: string }
  | { kind: "reviewed" }
  | { kind: "waiting" }
  | { kind: "answered"; answer: string }
  | { kind: "moved"; from: string; to: string };

type Template = readonly [en: string, de: string];
// Slots: {title} {duration} {passed} {failed} {exit} {answer} {from} {to}.
const TEMPLATES: Record<LineFact["kind"], readonly Template[]> = {
  finished: [["Done with {title}.", "Fertig mit {title}."], ["{title} is finished.", "{title} ist fertig."], ["That's {title} wrapped up.", "{title} ist abgeschlossen."],
    ["{title} took {duration}.", "{title} hat {duration} gedauert."], ["Finished {title} after {duration}.", "{title} nach {duration} fertig."]],
  stopped: [["{title} stopped before it finished.", "{title} hat vor dem Ende angehalten."], ["Hm. {title} stopped early.", "Hm. {title} wurde vorzeitig beendet."]],
  question: [["I have a question about {title}.", "Ich habe eine Frage zu {title}."], ["Question for you on {title}.", "Eine Frage an dich zu {title}."], ["Quick question about {title}.", "Kurze Frage zu {title}."]],
  longRun: [["{duration} into {title} so far.", "Schon {duration} an {title}."], ["Still on {title}. {duration} now.", "Noch an {title}. Jetzt {duration}."], ["{title}: {duration} and counting.", "{title}: {duration} und es läuft weiter."]],
  settled: [["{title} is settled.", "{title} ist abgeschlossen und abgerechnet."], ["Settled {title}. Thanks!", "{title} abgerechnet. Danke!"]],
  tests: [
    ["Tests pass: {passed} passed, none failed.", "Tests grün: {passed} bestanden, keiner fehlgeschlagen."], ["{passed} tests passed.", "{passed} Tests bestanden."], ["All green. {passed} passed.", "Alles grün. {passed} bestanden."],
    ["{failed} failed, {passed} passed.", "{failed} fehlgeschlagen, {passed} bestanden."], ["Ouch. {failed} tests failed.", "Autsch. {failed} Tests fehlgeschlagen."],
    ["Tests passed.", "Tests bestanden."], ["Test run passed.", "Testlauf bestanden."],
    ["Test run failed, exit code {exit}.", "Testlauf fehlgeschlagen, Exit-Code {exit}."], ["Tests failed. Exit code {exit}.", "Tests fehlgeschlagen. Exit-Code {exit}."],
  ],
  report: [["Report ready for review: {title}.", "Bericht zur Prüfung bereit: {title}."], ["Report ready for review.", "Bericht bereit zur Prüfung."]],
  reviewed: [["Review complete.", "Prüfung abgeschlossen."]],
  waiting: [["Needs your answer.", "Braucht deine Antwort."], ["Waiting for your answer.", "Wartet auf deine Antwort."]],
  answered: [["The boss said: {answer}", "Der Boss sagt: {answer}"]],
  moved: [["This chat moved from {from} to {to}. {from} hands over the work.", "Dieser Chat ist von {from} zu {to} gewechselt. {from} übergibt die Arbeit."]],
};

const clip = (text: string, max: number) => {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1), space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : t.slice(0, max)).replace(/[\s,.;:-]+$/, "")}…`;
};
const quote = (title: string, language: "en" | "de") => language === "de" ? `„${clip(title, 40)}“` : `“${clip(title, 40)}”`;

export function duration(minutes: number, language: "en" | "de") {
  const m = Math.max(1, Math.round(minutes)), h = Math.floor(m / 60), rest = m % 60;
  const unit = (n: number, en: [string, string], de: [string, string]) => `${n} ${(language === "de" ? de : en)[n === 1 ? 0 : 1]}`;
  const hours = h ? unit(h, ["hour", "hours"], ["Stunde", "Stunden"]) : "", mins = rest ? unit(rest, ["minute", "minutes"], ["Minute", "Minuten"]) : "";
  return [hours, mins].filter(Boolean).join(" ");
}

/** The slot values a fact provides, formatted per language. Missing facts give no slot. */
function slots(fact: LineFact, language: "en" | "de"): Record<string, string> {
  const s: Record<string, string> = {};
  const f = fact as Record<string, unknown>;
  if (typeof f.title === "string" && f.title.trim()) s.title = quote(f.title, language);
  if (typeof f.minutes === "number" && Number.isFinite(f.minutes) && f.minutes >= 1) s.duration = duration(f.minutes, language);
  if (fact.kind === "tests") {
    if (Number.isInteger(fact.passed) && fact.passed! >= 0) s.passed = String(fact.passed);
    if (Number.isInteger(fact.failed) && fact.failed! >= 0) s.failed = String(fact.failed);
    if (Number.isInteger(fact.exit)) s.exit = String(fact.exit);
  }
  if (fact.kind === "answered" && fact.answer.trim()) s.answer = clip(fact.answer, 60);
  if (fact.kind === "moved") { s.from = fact.from; s.to = fact.to; }
  return s;
}

// Test results pick their family from the facts: counts beat bare exit codes, and a passing
// line is never offered for a failing run (or the other way round).
function testFamily(fact: Extract<LineFact, { kind: "tests" }>, t: Template, counted: boolean) {
  const failing = (fact.failed ?? 0) > 0 || fact.exit !== 0;
  const mentionsFail = /\{failed\}|\{exit\}/.test(t[0]);
  if (failing !== mentionsFail) return false;
  if (counted) return /\{passed\}|\{failed\}/.test(t[0]) && (!/none failed/.test(t[0]) || fact.failed === 0);
  return !/\{passed\}|\{failed\}/.test(t[0]);
}

/** Every line this fact supports, in the given language, with its English twin for identity. */
export function eventCandidates(fact: LineFact, language: "en" | "de"): { en: string; text: string }[] {
  const values = slots(fact, language), english = slots(fact, "en");
  const fill = (t: string, v: Record<string, string>) => t.replace(/\{(\w+)\}/g, (_, k) => v[k]);
  const usable = TEMPLATES[fact.kind].filter(t => (t[0].match(/\{(\w+)\}/g) ?? []).every(slot => slot.slice(1, -1) in values));
  let chosen = usable;
  if (fact.kind === "tests") {
    // Counts beat bare exit codes when the counts can tell the story.
    chosen = usable.filter(t => testFamily(fact, t, fact.passed !== undefined || fact.failed !== undefined));
    if (!chosen.length) chosen = usable.filter(t => testFamily(fact, t, false));
  }
  return chosen.map(t => ({ en: fill(t[0], english), text: fill(language === "de" ? t[1] : t[0], values) }));
}

// Test commands and the summary lines their runners print.
const TEST_COMMAND = /(?:^|[\s;&|(])(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test\b|\b(?:vitest|jest|pytest|mocha|phpunit|rspec|ava)\b|\bcargo\s+(?:test|nextest)\b|\bgo\s+test\b|\b(?:node|deno|dotnet|mix)\s+(?:--)?test\b|\bctest\b/;
const lastCount = (text: string, re: RegExp) => { let n: number | undefined; for (const m of text.matchAll(re)) n = Number(m[1]); return n; };

/** A real test run's outcome from its command, output and exit code, or null when it was not one. */
export function testOutcome(command: string, output: string, exit: number | null | undefined): Extract<LineFact, { kind: "tests" }> | null {
  if (!Number.isInteger(exit) || !TEST_COMMAND.test(String(command ?? ""))) return null;
  const tail = String(output ?? "").slice(-6000).replace(/\x1b\[[0-9;]*m/g, "");
  const passed = lastCount(tail, /(\d+)\s+(?:tests?\s+)?(?:passed|passing)\b/gi) ?? lastCount(tail, /^#\s*pass\s+(\d+)/gim);
  const failed = lastCount(tail, /(\d+)\s+(?:tests?\s+)?(?:failed|failing)\b/gi) ?? lastCount(tail, /^#\s*fail\s+(\d+)/gim);
  return { kind: "tests", exit: exit as number, ...(passed !== undefined ? { passed } : {}), ...(failed !== undefined ? { failed } : {}) };
}
