// A message you send carries what you typed, then the threads you pointed to (as blocks the agent
// reads) and the files you attached (as an "Attached:" list of paths). The chat shows these parts
// as chips and thumbnails; the queue edits only the words and puts the rest back unchanged.

const TAG = "referenced_thread";
const REF = new RegExp(`\\n*<${TAG} id="([^"]*)" title="([^"]*)" project="([^"]*)"(?: harness="([^"]*)")?>[\\s\\S]*?</${TAG}>`, "g");
const ATTACHED = /\n*Attached:\n((?:- (?:image|file): .+(?:\n|$))+)\s*$/;

export type MessageRef = { id: string; title: string; project: string; harness?: string };
export type MessageFile = { kind: "image" | "file"; path: string; name: string };
export type MessageParts = { body: string; refs: MessageRef[]; blocks: string[]; files: MessageFile[] };

/** Splits a message into what you typed and the threads it referenced (with their raw blocks). */
export function splitRefs(text: string): { body: string; refs: MessageRef[]; blocks: string[] } {
  const refs: MessageRef[] = [], blocks: string[] = [];
  const body = text.replace(REF, (block, id, title, project, harness) => {
    refs.push(harness ? { id, title, project, harness } : { id, title, project });
    blocks.push(block.replace(/^\n+/, ""));
    return "";
  }).trim();
  return { body, refs, blocks };
}

/** Your words, the referenced threads and the attached files of a sent or queued message. */
export function messageParts(text: string): MessageParts {
  const files: MessageFile[] = [];
  let rest = text;
  const at = rest.match(ATTACHED);
  if (at) {
    rest = rest.slice(0, at.index);
    for (const line of at[1].trim().split("\n")) {
      const m = line.match(/^- (image|file): (.+)$/);
      if (!m) continue;
      const path = m[2].trim();
      files.push({ kind: m[1] as "image" | "file", path, name: path.split(/[\\/]/).pop()!.replace(/^\d+-/, "") });
    }
  }
  return { ...splitRefs(rest), files };
}

/** The message again, in the format the composer sends, with new words and the files you kept. */
export function composeMessage(parts: Pick<MessageParts, "blocks">, body: string, files: MessageFile[]): string {
  const blocks = parts.blocks;
  let text = body.trim() || (files.length ? "Have a look at the attached files." : blocks.length > 1 ? "Have a look at these threads." : blocks.length ? "Have a look at this thread." : "");
  if (blocks.length) text += `\n\n${blocks.join("\n\n")}`;
  if (files.length) text += `\n\nAttached:\n${files.map((f) => `- ${f.kind}: ${f.path}`).join("\n")}`;
  return text;
}
