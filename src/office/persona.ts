import type { RobotProfile } from "./roster";
import { HOBBY_LABEL } from "./roster";
import { harnessName } from "./brand";

// A worker's written persona: who it is, how it works and what it has done. It comes
// from the preferences every robot is hired with (they drive its desk and its free time)
// plus a line for each approved report. The daily writer reads these files to write the
// office's flavor text, and the focus view shows them.

const WINDOWS: Record<string, string> = { fullscreen: "keeps one app fullscreen", tiler: "tiles windows side by side", floating: "lets windows float and overlap" };
const LISTENS: Record<string, string> = { always: "always works with music on", sometimes: "puts music on now and then", never: "works in silence" };
const TIDY: Record<string, string> = { tidy: "closes what it is done with", normal: "keeps a few windows open", messy: "lets windows pile up" };
const LAUNCH: Record<string, string> = { dock: "opens apps from the dock", spotlight: "opens apps with a quick search" };
const SWITCH: Record<string, string> = { click: "clicks back into windows", dock: "switches through the dock", alttab: "switches with Alt+Tab" };
const GIT: Record<string, string> = { cli: "commits in the terminal", desktop: "commits with a desktop Git app" };
const TASKS: Record<string, string> = { board: "a task board", checklist: "a checklist app", sticky: "sticky notes on the desk" };
const GAME: Record<string, string> = { snake: "Snake", flappy: "Drone Hop", dash: "Dash", chess: "Chess" };
const APP: Record<string, string> = { doodle: "doodling", crossword: "crosswords", solitaire: "solitaire", stocks: "watching stocks", mail: "tidying mail", lingo: "language lessons", vapor: "Vapor games", trading: "Botcoin charts" };
const SOCIAL: Record<string, string> = { botsapp: "BotsApp", telegrid: "Telegrid", chirp: "Chirp", instabot: "Instabot", snapbot: "Snapbot", shorts: "Shorts", spool: "Spool", sparkplug: "Sparkplug" };

/** The persona as readable lines (focus view) */
export function personaLines(robot: RobotProfile) {
  const p = robot.prefs;
  if (!p) return [];
  const favorite = Object.entries(p.games ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0];
  return [
    `${HOBBY_LABEL[p.hobby] ?? "Easygoing"} on breaks${p.apps?.length ? `, into ${p.apps.slice(0, 3).map(a => APP[a] ?? a).join(", ")}` : ""}.`,
    `${cap(WINDOWS[p.windows] ?? "arranges windows its own way")} and ${TIDY[p.tidiness] ?? "keeps a few windows open"}.`,
    `${cap(LAUNCH[p.launch] ?? "opens apps from the dock")}, ${SWITCH[p.switching] ?? "clicks back into windows"} and ${GIT[p.git] ?? "commits in the terminal"}.`,
    `${cap(LISTENS[p.listens] ?? "works in silence")}. Plans with ${TASKS[p.tasks] ?? "a checklist"}.`,
    `${favorite ? `Favorite game: ${GAME[favorite] ?? favorite}.` : ""}${p.socials?.length ? ` Hangs out on ${p.socials.slice(0, 3).map(s => SOCIAL[s] ?? s).join(", ")}.` : ""}`.trim(),
  ].filter(Boolean);
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The persona file the daily writer reads. Work entries come only from approved reports. */
export function personaMarkdown(robot: RobotProfile) {
  const setup = `${harnessName(robot.provider)}${robot.lastModel ? `, ${robot.lastModel}` : ""}`;
  const log = (robot.log ?? []).slice(-12).map(e => `- ${e.at.slice(0, 10)}: ${e.title}${e.project ? ` (${e.project})` : ""}`);
  return [
    `# ${robot.name}`,
    "",
    `Worker robot. Setup: ${setup}. Hired ${new Date(robot.hiredAt).toISOString().slice(0, 10)}. ${robot.jobs} jobs, ${robot.approved ?? 0} approved reports.${robot.retired ? " Retired." : ""}`,
    "",
    "## Personality and habits",
    ...personaLines(robot).map(l => `- ${l}`),
    "",
    "## Approved work",
    ...(log.length ? log : ["- Nothing approved yet."]),
    "",
  ].join("\n");
}
