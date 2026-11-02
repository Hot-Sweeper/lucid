// Where an attached file really came from.
//
// An agent sends a file in three steps: it asks T3 for an upload slot, posts the file's bytes to the
// slot, then sends the message with the slot's attachment id. The third step names the file and its
// size but not its folder. The folder is only in the second step, as the path the agent gave to the
// upload command. This module reads those recorded steps and nothing else; if they do not name the
// file's path, the source stays unknown and the Explorer says so instead of guessing a folder.

export type SentAttachment = { id: string; name: string; type?: string; mimeType?: string; sizeBytes?: number };
export type RecordedItem = { id: string; type: string; status?: string; data?: any };

export type AttachmentSource = {
  attachment: SentAttachment;
  /** Absolute path on this machine, or null when the recorded steps do not name one. */
  path: string | null;
  how: "upload-command" | "unknown";
  /** What happened to the upload command that carried the bytes, when it can be told. */
  upload: "sent" | "failed" | "unknown";
};

const textOf = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "string") return v;
  try { return JSON.stringify(v); } catch { return ""; }
};

/** The command line of a shell step, however the harness recorded it. */
export function commandOf(item: RecordedItem): string {
  const d = item.data || {};
  const input = d.input;
  if (typeof input === "string") return input;
  if (input && typeof input === "object") {
    for (const key of ["command", "cmd", "script"]) if (typeof input[key] === "string") return input[key];
  }
  return "";
}

const isShell = (item: RecordedItem) => {
  if (item.type === "command_execution") return true;
  if (item.type !== "dynamic_tool") return false;
  const base = String(item.data?.toolName || "").replace(/^mcp__.+?__/, "").replace(/^[\w-]+\./, "");
  return /^(bash|powershell|shell|run_command)$/i.test(base);
};

const isPrepare = (item: RecordedItem) => item.type === "dynamic_tool" && /t3_attachment_prepare_upload$/.test(String(item.data?.toolName || ""));

/** Absolute or relative file paths written in a command. URLs and the upload slot itself are not files. */
export function pathsIn(command: string, ignore: string[] = []): string[] {
  const found: string[] = [];
  const push = (raw: string) => {
    let p = raw.trim().replace(/^@/, "").replace(/^file=@/, "").replace(/[),;]+$/, "");
    if (!p || /^[a-z][a-z0-9+.-]*:\/\//i.test(p) || p.startsWith("//")) return;
    if (ignore.some((i) => i && p.includes(i))) return;
    if (!/\.[A-Za-z0-9]{1,8}$/.test(p)) return;
    if (!found.includes(p)) found.push(p);
  };
  for (const m of command.matchAll(/"((?:[A-Za-z]:[\\/]|\/|\.{1,2}[\\/])[^"\r\n]+?)"|'((?:[A-Za-z]:[\\/]|\/|\.{1,2}[\\/])[^'\r\n]+?)'/g)) push(m[1] ?? m[2]);
  for (const m of command.matchAll(/(?<![\w"'\\/.:-])@?((?:[A-Za-z]:[\\/]|\/)[^\s"'<>|*?]+)/g)) push(m[1]);
  return found;
}

const baseOf = (p: string) => p.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || p;
const lower = (s: string) => s.toLowerCase();

/** `cwd` anchors a relative path; without a working directory a relative path is not trusted. */
export function sourcesFor(attachments: SentAttachment[], items: Iterable<RecordedItem>, cwd?: string | null): AttachmentSource[] {
  const all = [...items];
  const prepares = all.filter(isPrepare);
  const shells = all.filter(isShell);
  return attachments.map((attachment) => {
    // the upload slot this attachment id belongs to
    const slot = prepares.find((p) => textOf(p.data?.output).includes(attachment.id));
    const slotUrl = (textOf(slot?.data?.output).match(/"relativeUrl"\s*:\s*"([^"]+)"/)?.[1] ?? "").replace(/\\\//g, "/");
    const keys = [slotUrl, attachment.id].filter(Boolean);
    const carriers = shells.filter((s) => { const c = commandOf(s); return keys.some((k) => c.includes(k)); });
    const candidates: { path: string; item: RecordedItem }[] = [];
    for (const item of carriers) for (const path of pathsIn(commandOf(item), keys)) candidates.push({ path, item });
    const named = candidates.filter((c) => lower(baseOf(c.path)) === lower(attachment.name));
    let pick = named[named.length - 1] ?? null;
    if (!pick) {
      const sameExt = candidates.filter((c) => lower(c.path.split(".").pop() || "") === lower(attachment.name.split(".").pop() || ""));
      if (sameExt.length === 1) pick = sameExt[0];
    }
    if (!pick) return { attachment, path: null, how: "unknown" as const, upload: "unknown" as const };
    let path = pick.path;
    if (!/^(?:[A-Za-z]:[\\/]|\/)/.test(path)) {
      if (!cwd) return { attachment, path: null, how: "unknown" as const, upload: "unknown" as const };
      path = `${cwd.replace(/[\\/]+$/, "")}/${path.replace(/^\.\//, "")}`;
    }
    const status = String(pick.item.status || "");
    const upload = /failed|cancel|interrupt|error/i.test(status) ? "failed" : /complete|done|success/i.test(status) ? "sent" : "unknown";
    return { attachment, path, how: "upload-command" as const, upload };
  });
}

/** The attachments a send step names, if it names any. */
export function attachmentsOf(input: any): SentAttachment[] {
  const list = Array.isArray(input?.attachments) ? input.attachments : [];
  return list
    .filter((a: any) => a && typeof a.name === "string" && typeof a.id === "string")
    .slice(0, 8)
    .map((a: any) => ({ id: a.id, name: a.name, type: a.type, mimeType: a.mimeType, sizeBytes: Number.isFinite(a.sizeBytes) ? a.sizeBytes : undefined }));
}
