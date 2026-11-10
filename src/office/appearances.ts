// Reuse the app's material and provider palettes. Screen geometry stays identical so
// real apps, hand targets and distance detail tiers keep working on every model.
export const COMPUTERS = {
  classic: { name: 'Classic workstation', shell: '#2a2f45', edge: '#151927', radius: 12 },
  cream: { name: 'Cream workstation', shell: '#eee3cb', edge: '#b5a68c', radius: 12 },
  mint: { name: 'Mint workstation', shell: '#bfd6c7', edge: '#5b8274', radius: 12 },
  peach: { name: 'Peach workstation', shell: '#ffc3a0', edge: '#b6775c', radius: 12 },
  retro: { name: 'Retro terminal', shell: '#d7b48a', edge: '#785b3d', radius: 4 },
  graphite: { name: 'Graphite studio', shell: '#454545', edge: '#202020', radius: 6 },
} as const;
export type ComputerId = keyof typeof COMPUTERS;
export function computerPreview(id: ComputerId, w = 160, h = 112) {
  const c = COMPUTERS[id];
  return `<svg viewBox="0 0 160 112" width="${w}" height="${h}" aria-hidden="true"><ellipse cx="80" cy="103" rx="65" ry="5" fill="#000" opacity=".15"/><path d="M70 78h20v16h17v5H53v-5h17z" fill="${c.edge}"/><rect x="12" y="8" width="136" height="78" rx="${c.radius}" fill="${c.shell}"/><rect x="19" y="15" width="122" height="63" rx="3" fill="#1b1f45"/><path d="m30 33 9 7-9 7m16 0h22" fill="none" stroke="#ffd3b3" stroke-width="3" stroke-linecap="round"/><rect x="40" y="99" width="80" height="8" rx="3" fill="${c.edge}"/></svg>`;
}
