// Reports are Markdown, while imported office documents already contain styled runs.
// Convert once before presentation so typing never re-parses markup or inserts raw HTML.
import { Marked, type Token, type Tokens } from "marked";
import type { Block, Run, WordDoc } from "./model";

const markdown = new Marked({ gfm: true, breaks: true });

export function reportDocument(title: string, source: string): WordDoc {
  const entity = document.createElement("textarea");
  const decode = (text: string) => text.replace(/&(?:#\d+|#x[\da-f]+|[a-z][\da-z]+);/gi, value => {
    entity.innerHTML = value;
    return entity.value;
  });
  const inline = (tokens: Token[] = [], style: Omit<Run, "t"> = {}): Run[] => tokens.flatMap((token): Run[] => {
    switch (token.type) {
      case "strong": return inline(token.tokens, { ...style, b: true });
      case "em": return inline(token.tokens, { ...style, i: true });
      case "del": return inline(token.tokens, { ...style, s: true });
      case "codespan": return [{ ...style, code: true, t: token.text }];
      case "link": return inline(token.tokens, { ...style, href: decode(token.href) });
      // Describe embedded pictures without starting downloads in every robot's monitor.
      case "image": return inline(token.tokens, style);
      case "br": return [{ ...style, t: "\n" }];
      case "checkbox": return [];
      case "text": return token.tokens ? inline(token.tokens, style) : [{ ...style, t: decode(token.text) }];
      case "escape": return [{ ...style, t: token.text }];
      // HTML stays visible text. It never becomes DOM or an executable attribute.
      default: return [{ ...style, t: token.raw || "" }];
    }
  });
  const content = (tokens: Token[] = []) => {
    const runs = inline(tokens);
    return { text: runs.map(run => run.t).join(""), runs };
  };
  const blocks: Block[] = [{ kind: "h", level: 0, text: title }];
  const append = (tokens: Token[] = [], level = 0, quote = false) => {
    for (const token of tokens) {
      switch (token.type) {
        case "space": case "def": case "checkbox": break;
        case "heading": blocks.push({ kind: "h", level: token.depth, ...content(token.tokens) }); break;
        case "paragraph": case "text":
          blocks.push({ kind: "p", ...content(token.tokens || [token]), quote }); break;
        case "blockquote": append(token.tokens, level, true); break;
        case "code": blocks.push({ kind: "p", text: token.text, code: true, quote }); break;
        case "hr": blocks.push({ kind: "p", text: "", rule: true }); break;
        case "list": {
          const list = token as Tokens.List;
          list.items.forEach((item, index) => {
            let first = true;
            for (const child of item.tokens) {
              if (child.type === "space" || child.type === "checkbox") continue;
              if (first && (child.type === "text" || child.type === "paragraph")) {
                blocks.push({ kind: "li", ...content(child.tokens || [child]), level: Math.min(level, 6),
                  ordered: list.ordered,
                  marker: item.task ? (item.checked ? "☑" : "☐") : list.ordered ? `${Number(list.start) + index}.` : undefined });
                first = false;
              } else append([child], level + 1, quote);
            }
          });
          break;
        }
        case "table": {
          const table = token as Tokens.Table;
          const cells = [table.header, ...table.rows].map(row => row.map(cell => content(cell.tokens)));
          blocks.push({ kind: "table", rows: cells.map(row => row.map(cell => cell.text)),
            cellRuns: cells.map(row => row.map(cell => cell.runs)) });
          break;
        }
        default: blocks.push({ kind: "p", text: token.raw, quote });
      }
    }
  };
  append(markdown.lexer(source || title));
  return { kind: "word", name: title, blocks };
}
