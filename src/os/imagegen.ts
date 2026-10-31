// Image generation, as T3 Code reports it. Codex makes pictures with its image tool (a dynamic
// tool call, an item of its own, or the imagegen skill running its script in a command). This
// reads the real prompt and, once the call is done, where the picture ended up.
import { tokens, unwrap } from "./classify";

type AnyItem = { id: string; type: string; status: string; data: any };

export type ImageGen = { prompt: string; size?: string; edit: boolean };
export type ImageResult = { sources: string[]; failed?: string };

const TOOL_NAME = /image[_\-. ]?gen|generate[_\- ]?image|text[_\- ]?to[_\- ]?image|create[_\- ]?image|gpt-image|dall-?e/i;
const SCRIPT = /image_gen(?:\.py)?["']?\s+(?:generate(?:-batch)?|edit)\b|\bimage_gen(?:\.py)?\b[^\n]*--prompt/i;
const PIC = "png|jpe?g|webp|gif";
const FILE_IN_TEXT = new RegExp(String.raw`(?:[A-Za-z]:[\\/]|~[\\/]|/)[^\r\n"'<>|*?]*?\.(?:${PIC})\b`, "gi");

const asObject = (v: unknown): Record<string, any> => {
  if (v && typeof v === "object") return v as Record<string, any>;
  if (typeof v === "string") { try { const o = JSON.parse(v); return o && typeof o === "object" ? o : {}; } catch { return {}; } }
  return {};
};

function flag(cmd: string, name: string): string | undefined {
  const t = tokens(cmd);
  for (let i = 0; i < t.length; i++) {
    if (t[i] === name) return t[i + 1];
    if (t[i].startsWith(name + "=")) return t[i].slice(name.length + 1);
  }
  return undefined;
}

/** What image generation this item is, or null when it is something else. */
export function imageGenOf(it: AnyItem): ImageGen | null {
  const d = it.data ?? {};
  if (it.type === "command_execution") {
    const cmd = unwrap(String(d.input ?? ""));
    if (!SCRIPT.test(cmd)) return null;
    return { prompt: (flag(cmd, "--prompt") ?? "").trim(), size: flag(cmd, "--size"), edit: /image_gen(?:\.py)?["']?\s+edit\b/i.test(cmd) };
  }
  const named = it.type === "dynamic_tool" ? TOOL_NAME.test(String(d.toolName ?? "").replace(/^.*[.]/, "")) : TOOL_NAME.test(it.type);
  if (!named) return null;
  const inp = asObject(d.input ?? d.arguments);
  const prompt = String(d.revisedPrompt ?? d.prompt ?? inp.prompt ?? inp.description ?? inp.text ?? inp.query ?? "").trim();
  const size = inp.size ?? d.size;
  return { prompt, size: typeof size === "string" ? size : undefined, edit: /edit/i.test(String(d.toolName ?? "")) || !!inp.image || !!inp.images };
}

const mimeOf = (b64: string) => (b64.startsWith("/9j/") ? "image/jpeg" : b64.startsWith("UklGR") ? "image/webp" : b64.startsWith("R0lGOD") ? "image/gif" : "image/png");

/** Pictures this item produced: files on disk (as lucid-file addresses through `toUrl`) or inline data. */
export function imageResult(it: AnyItem, toUrl: (path: string) => string): ImageResult {
  const d = it.data ?? {};
  const out: string[] = [];
  const add = (u: string) => { if (!out.includes(u)) out.push(u); };
  const walk = (v: unknown, depth = 0) => {
    if (depth > 6 || v == null) return;
    if (typeof v === "string") {
      const s = v.trim();
      if (/^data:image\//i.test(s)) return add(s);
      if (s.length > 4000 && /^[A-Za-z0-9+/=\s]+$/.test(s.slice(0, 120))) return add(`data:${mimeOf(s)};base64,${s.replace(/\s+/g, "")}`);
      if (s.length < 600 && !/[\r\n]/.test(s) && new RegExp(String.raw`^(?:[A-Za-z]:[\\/]|~[\\/]|/).+\.(?:${PIC})$`, "i").test(s)) return add(toUrl(s));
      for (const m of s.matchAll(FILE_IN_TEXT)) add(toUrl(m[0]));
      return;
    }
    if (Array.isArray(v)) return v.forEach((x) => walk(x, depth + 1));
    if (typeof v === "object") for (const [k, x] of Object.entries(v as object)) if (k !== "input" && k !== "prompt") walk(x, depth + 1);
  };
  if (it.type === "command_execution") walk(d.output);
  else walk({ o: d.output, r: d.result, s: d.savedPath, p: d.path, i: d.images, f: d.files, u: d.url });
  const failed = it.status === "failed" || d.output?.isError || (it.type === "command_execution" && d.exitCode != null && d.exitCode !== 0)
    ? String(d.error?.message ?? d.error ?? (typeof d.output === "string" ? d.output : d.output?.error ?? (Array.isArray(d.output?.content) ? d.output.content.map((c: any) => c?.text || "").join("\n") : "")) ?? "").trim().split(/\r?\n/).slice(-1)[0] || "The image could not be generated" : undefined;
  return { sources: out, failed };
}

/** Width over height of a size such as "1024x1536". */
export function ratioOf(size?: string): number {
  const m = (size ?? "").match(/(\d{2,5})\s*[x×]\s*(\d{2,5})/i);
  if (!m) return 1;
  const r = +m[1] / +m[2];
  return Math.min(1.8, Math.max(0.55, r));
}
