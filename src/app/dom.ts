// The renderer bridge and two tiny DOM helpers every app module uses.
import { esc } from "../util/html";
export { esc };
export const api = window.lucid;
export const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
