import type { WM } from "./wm";
import type { FilesApp } from "./explorer";
import type { T3CodeApp, DraftFile } from "../harness/t3code";
import type { AttachmentSource } from "./attachment-source";
import { carryFiles } from "./drag-drop";
import { iconFor, kindOf } from "./file-kinds";
import { fmtBytes, isInside, normPath, parentOf, pathKey } from "./explorer-model";
import { chatFileUrl } from "../office/chat-media";
import { phaseOf, type WatchedView } from "./tool-view";

/** What the disk said about one exact path. Nothing was listed or read to get it. */
export type DiskFact = { path: string; known: boolean; exists?: boolean; file?: boolean; size?: number; modified?: number; reason?: string };
export type SendOutcome = "sent" | "failed" | "pending";

export function attachmentSendOutcome(item: { status?: string; data?: { output?: unknown } }): SendOutcome {
  let output = item.data?.output;
  if (typeof output === "string") { try { output = JSON.parse(output); } catch { /* plain tool text */ } }
  if (phaseOf({ status: item.status, output }) === "failed") return "failed";
  return /^(completed|done|success)$/i.test(item.status || "") ? "sent" : "pending";
}

export type SendContext = {
  wm: WM;
  files: FilesApp;
  chat: T3CodeApp;
  root: string | null;
  sources: AttachmentSource[];
  disk: DiskFact[];
  /** The message words that go with the files. */
  text: () => string;
  /** Resolves once the real send finished (or the wait ran out, then "pending"). */
  outcome: () => Promise<SendOutcome>;
  state?: () => SendOutcome;
  follow?: (view: WatchedView) => void;
  /** Replaying history: show the result, do not walk anywhere. */
  instant?: boolean;
};

const IMAGE = /^(png|jpe?g|gif|webp|avif|bmp|svg)$/i;

const draftFor = (s: AttachmentSource, fact: DiskFact | undefined): DraftFile => {
  const name = s.attachment.name;
  const here = !!(s.path && fact?.known && fact.exists && fact.file);
  const bytes = s.attachment.sizeBytes ?? (here ? fact!.size : undefined);
  return {
    name,
    icon: iconFor(kindOf(name)),
    // a picture only when the real file was found on this machine; otherwise the file's icon
    thumb: here && IMAGE.test(name.split(".").pop() || "") ? chatFileUrl(s.path!) : null,
    size: bytes != null ? fmtBytes(bytes) : undefined,
  };
};

/** Keep the folder window clear of the message box so both stay visible while a file is carried. */
async function clearTheWay(wm: WM, composer: HTMLElement) {
  const w = wm.wins.get("files");
  if (!w) return;
  const a = wm.pos(w.el, 0, 0), b = wm.pos(w.el, 1, 1);
  const c1 = wm.pos(composer, 0, 0), c2 = wm.pos(composer, 1, 1);
  // the message box grows by a row when files land in it, so keep that row clear as well
  const top = c1.y - 56;
  if (!(a.x < c2.x && b.x > c1.x && a.y < c2.y && b.y > top)) return;
  const width = b.x - a.x, height = b.y - a.y;
  const room = top - 8;
  if (room < 170) return;
  await wm.dragTo("files", { x: Math.max(4, Math.min(a.x, wm.width - width - 4)), y: 4, w: width, h: Math.min(height, room) });
}

/**
 * The robot attaches the files it sends: it opens each file's folder in the Explorer, selects the file,
 * drags it into the chat's message box and sends. Everything shown is something the recorded steps
 * state. A file whose folder the recorded steps do not name is added with the paperclip instead, with
 * no folder shown. Nothing here uploads or sends: the upload and the send already happened (or failed)
 * as tool calls, and this only plays them back.
 */
export async function playSend(ctx: SendContext): Promise<SendOutcome> {
  const { wm, files, chat, root } = ctx;
  const e = wm.epoch;
  const factFor = (p: string | null) => (p ? ctx.disk.find((d) => pathKey(d.path) === pathKey(p)) : undefined);
  const items = ctx.sources.map((s) => ({ s, fact: factFor(s.path), draft: draftFor(s, factFor(s.path)) }));
  const drafts = items.map((i) => i.draft);
  const text = ctx.text();
  const follow = () => { if (ctx.state && ctx.follow) ctx.follow(chat.followDraft(ctx.state)); };
  // a new attempt replaces the draft a refused one left in the message box
  if (chat.draftCount) { chat.clearDrafts(); chat.holdDraft(""); }

  if (ctx.instant) {
    const result = await ctx.outcome();
    if (result === "failed") { await chat.show(); chat.addDrafts(drafts); chat.setDraftState("failed"); chat.holdDraft(text); }
    else if (result === "pending") { await chat.show(); chat.addDrafts(drafts); chat.holdDraft(text); chat.setDraftState("sending"); follow(); }
    else await chat.assistant(() => ({ text, done: true }), false, drafts);
    return result;
  }

  await chat.show();
  wm.check(e);
  const located = items.filter((i) => i.s.path && i.fact?.known && i.fact.exists && i.fact.file);
  const loose = items.filter((i) => !located.includes(i));

  // group by folder: one trip per folder, several files picked together
  const groups = new Map<string, typeof located>();
  for (const it of located) {
    const dir = normPath(parentOf(normPath(it.s.path!)) ?? it.s.path!);
    const k = pathKey(dir);
    groups.set(k, [...(groups.get(k) ?? []), it]);
  }
  const trips = [...groups.values()];
  try {
    for (const group of trips.slice(0, 3)) {
      const first = group[0];
      const where = root && isInside(first.s.path!, root) ? root : null;
      const shown = await files.reveal({ path: first.s.path!, name: first.s.attachment.name, bytes: first.fact?.size, modified: first.fact?.modified }, where, { thumbUrl: first.draft.thumb });
      wm.check(e);
      await clearTheWay(wm, chat.composer);
      const rows: HTMLElement[] = [shown.row];
      for (const more of group.slice(1)) {
        wm.robot.pressKey("Control");
        const r = await files.selectIn(more.s.path!, true);
        if (r) rows.push(r);
      }
      if (rows.length) await carryFiles(wm, rows, group.map((g) => g.draft), chat.composer);
      wm.check(e);
      chat.addDrafts(group.map((g) => g.draft));
      await wm.sleep(180, e);
    }
    // anything past three trips, and files whose folder is not known
    const rest = [...trips.slice(3).flat(), ...loose];
    if (rest.length) {
      await wm.pointAt(chat.clipButton, 0.5, 0.5, 420);
      await wm.click();
      chat.addDrafts(rest.map((r) => r.draft));
      await wm.sleep(200, e);
    }
  } catch (err) {
    // interrupted: the unfinished draft does not claim anything was sent
    if (chat.draftCount) chat.clearDrafts();
    throw err;
  }

  if (!chat.draftCount) return ctx.outcome();
  chat.setDraftState("sending");
  const result = await ctx.outcome();
  wm.check(e);
  if (result === "failed") {
    chat.setDraftState("failed");
    chat.holdDraft(text);
    return result;
  }
  if (result === "pending") { chat.holdDraft(text); follow(); return result; }
  chat.setDraftState("ready");
  await chat.assistant(() => ({ text, done: true }), true, drafts);
  return result;
}
