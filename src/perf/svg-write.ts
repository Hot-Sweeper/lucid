/** Avoid invalidating SVG style/paint when a rig's rounded geometry did not change.
 * Read the attribute itself so GSAP, customization and other writers remain authoritative.
 * getAttribute does not force layout, unlike geometry reads in an animation callback.
 */
export function setSvgAttribute(el: SVGElement, name: string, value: string) {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}
