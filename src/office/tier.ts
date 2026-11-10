// How strong a robot's model is, so bigger models can look a little more distinguished
// (a brighter antenna, a trim on the shell) without changing the robot's character.

export type Tier = "light" | "standard" | "flagship";

const FLAGSHIP = /\b(opus|fable|sol|astra|ultra|pro|max|o\d|gpt-?5(?!.*(mini|nano))|gpt-?6(?!.*(luna|mini|nano)))/i;
const LIGHT = /\b(haiku|luna|mini|nano|lite|flash-?lite|small|tiny|spark)\b/i;

/** Model name to tier: luna, haiku and minis are light; opus, sol, astra and pro models are flagship. */
export function tierFor(model: string | null | undefined): Tier {
  const m = (model || "").toLowerCase();
  if (!m) return "standard";
  if (LIGHT.test(m)) return "light";
  if (/\b(terra|sonnet|flash|medium)\b/i.test(m)) return "standard";
  if (FLAGSHIP.test(m)) return "flagship";
  return "standard";
}

