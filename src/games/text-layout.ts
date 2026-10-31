type TextContext = Pick<CanvasRenderingContext2D, "font" | "measureText">;

/** One caption at a time. Motion redraws reuse its measurements until the text or font changes. */
export function textLayout() {
  let previousText: string | undefined, previousFont = "", previousWidth = NaN;
  let cached = { lines: [] as string[], width: 0 };
  return {
    clear() { previousText = undefined; },
    get(ctx: TextContext, text: string, maxWidth: number) {
      if (text === previousText && ctx.font === previousFont && maxWidth === previousWidth) return cached;
      const lines: string[] = [];
      let line = "", width = 0;
      for (const word of text.split(" ")) {
        const candidate = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(candidate).width > maxWidth) { lines.push(line); line = word; }
        else line = candidate;
      }
      if (line) lines.push(line);
      for (const line of lines) width = Math.max(width, ctx.measureText(line).width);
      previousText = text; previousFont = ctx.font; previousWidth = maxWidth;
      return cached = { lines, width };
    },
  };
}
