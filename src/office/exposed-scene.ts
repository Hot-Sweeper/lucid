type Box = { left: number; right: number; top: number; bottom: number };

/** Visible horizontal interval in scene coordinates. Docked panels already sit
 * outside the scene, so only actual overlap is removed. Zero-size hidden rails
 * and small floating controls cannot become a new scene edge. */
export function exposedScene(scene: Box, panels: readonly Box[]) {
  let left = scene.left, right = scene.right;
  const middle = (left + right) / 2, height = scene.bottom - scene.top;
  for (const p of panels) {
    if (p.right <= p.left || Math.min(p.bottom, scene.bottom) - Math.max(p.top, scene.top) < height * .9) continue;
    if (p.left <= scene.left && p.right > scene.left) left = Math.max(left, p.right);
    else if (p.right >= scene.right && p.left < scene.right) right = Math.min(right, p.left);
    else if (p.left < middle && p.right > left) left = Math.max(left, p.right);
    else if (p.right > middle && p.left < right) right = Math.min(right, p.left);
  }
  return { left: Math.max(0, left - scene.left), right: Math.max(0, scene.right - right) };
}
