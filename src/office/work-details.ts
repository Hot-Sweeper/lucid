import { Lexer, type Token } from 'marked';
import { chatFileUrl, chatMediaKind, localMediaPath } from './chat-media';
import type { WorkDetails } from './monitor-tasks';

type Message = { role?: string; text?: string; at?: string; attachments?: { type?: string; path?: string; name?: string }[] };
/** Build a monitor report from real assistant evidence, including Markdown file links. */
export function buildWorkDetails(messages: Message[], threadId: string, markdown: (text: string) => string): WorkDetails {
  const plain = (m?: Message) => String(m?.text || '').split('<lucid-work-skill>')[0].replace(/```[\s\S]*?```/g, ' [code] ').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/[*_`#>]+/g, '').trim();
  const replies = messages.filter(m => m.role === 'assistant' && (m.text?.trim() || m.attachments?.length));
  const report = [...replies].reverse().find(m => plain(m).length >= 220) ?? replies.at(-1);
  const images: WorkDetails['images'] = [], seen = new Set<string>();
  const add = (source: string, name: string) => {
    if (chatMediaKind(source) !== 'image') return;
    const local = localMediaPath(source);
    if (!local && !/^https?:\/\//i.test(source)) return;
    let url: string;
    if (local) url = chatFileUrl(local, threadId);
    else { try { const u = new URL(source); if (u.username || u.password) return; url = u.href; } catch { return; } }
    if (seen.has(url)) return; seen.add(url);
    images.push({ url, name: name || source.split(/[\\/]/).pop() || 'Result screenshot' });
  };
  const walk = (tokens: Token[]) => {
    for (const t of tokens) {
      if (t.type === 'image' || t.type === 'link') add(t.href, t.text);
      if ('tokens' in t && t.tokens) walk(t.tokens);
      if (t.type === 'list') for (const item of t.items) walk(item.tokens);
    }
  };
  // Newest assistant evidence first. Uploaded task/reference pictures never become result claims.
  for (const m of [...replies].reverse()) {
    walk(Lexer.lex(m.text || ''));
    for (const a of m.attachments || []) if (a.type === 'image' && a.path) add(a.path, a.name || 'Result screenshot');
    if (images.length >= 12) break;
  }
  const raw = report?.text?.trim() || '';
  return { task: plain(messages.find(m => m.role === 'user' && m.text && !m.text.startsWith('[User attached'))).split('<lucid-work-skill>')[0].trim(),
    report: plain(report), reportHtml: raw ? markdown(raw.slice(0, 24000)) : undefined,
    images: images.slice(0, 12), endedAt: messages.at(-1)?.at || null, messages: messages.length };
}
