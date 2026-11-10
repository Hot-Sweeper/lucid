// Escaping text for HTML built from template strings.

/** Escapes `&`, `<`, `>` and `"`: safe for element content and double-quoted attributes. */
export const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
