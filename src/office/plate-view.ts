// How desk nameplates read at every camera zoom (semantic zoom). The topic keeps at least
// MIN_PX on screen: close up the plate is its own size in the room; further out it grows
// toward the free floor left of the robot (up to DESK_GROW); further still it becomes one
// line under the desk, as wide as a workstation at most, and the topic gets fewer words.
// Too far for a short topic the plates step back and the room signs carry the labels.

export const PLATE_FONT = '600 12px "Lexend Variable"';
export const TOPIC_PX = 12;
/** The widest topic at desk scale: the plate ends left of the seated robot's arm. */
export const DESK_TOPIC = 130;
const MIN_PX = 11, DESK_GROW = 1.85, FAR_WIDTH = 380, PAD = 16;
// Far topics come in a few widths, so zooming changes a label only now and then.
const STEPS = [130, 110, 90, 72];

export type PlateView = { form: "desk" | "far" | "hidden"; zoom: number; budget: number };

export function plateView(s: number): PlateView {
  const want = MIN_PX / (TOPIC_PX * Math.max(s, 1e-6));
  if (want <= DESK_GROW) return { form: "desk", zoom: round(Math.max(1, want)), budget: DESK_TOPIC };
  const room = FAR_WIDTH / want - PAD;
  const budget = STEPS.find((w) => w <= room);
  return budget ? { form: "far", zoom: round(want), budget } : { form: "hidden", zoom: round(want), budget: 0 };
}

const round = (v: number) => Math.round(v * 100) / 100;
