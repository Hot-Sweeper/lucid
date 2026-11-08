import { Lexer, type Token } from "marked";

/** Reasoning summaries may contain Markdown. Construct only safe inline DOM nodes. */
export function setActivityText(target: HTMLElement, text: string) {
  const render = (tokens: Token[], parent: Node) => {
    for (const token of tokens) {
      if (token.type === "strong" || token.type === "em" || token.type === "codespan") {
        const node = document.createElement(token.type === "strong" ? "strong" : token.type === "em" ? "em" : "code");
        if (token.type === "codespan") node.textContent = token.text;
        else render("tokens" in token ? token.tokens ?? [] : [], node);
        parent.appendChild(node);
      } else if (token.type === "text" && token.tokens) render(token.tokens, parent);
      else parent.appendChild(document.createTextNode(token.type === "escape" ? token.text : token.raw));
    }
  };
  target.replaceChildren();
  render(Lexer.lexInline(text), target);
}
