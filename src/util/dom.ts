// Small DOM helpers used across the renderer.

/** The user asked the system for less motion. */
export const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

let seq = 0;
/** A document-unique id prefix, for SVG gradients, clips and masks that several copies of a drawing share a page with. */
export const uid = (p = "w") => `${p}${++seq}${Math.random().toString(36).slice(2, 6)}`;
