// The renderer bridge and two tiny DOM helpers every app module uses.
export const api = window.lucid;
export const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
