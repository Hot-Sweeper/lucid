import { portraitSvg, PALETTES, brandFor, type RobotLook } from "../robot";
import { icon, type IconName } from "../ui/icons";

export const reportPortrait = (provider: string, look: RobotLook = {}, size = 116) => portraitSvg(look, PALETTES[brandFor(provider)], { size, bust: true, cls: "paper-robot" });

const ICONS = { crew: "users", energy: "bolt", coin: "coin", check: "checkSquare", settled: "statusSettled", paper: "file", image: "image", back: "arrowLeft", next: "arrowRight" } as const satisfies Record<string, IconName>;
export function reportIcon(name: keyof typeof ICONS) { return icon(ICONS[name], 16, { cls: "paper-icon" }); }
