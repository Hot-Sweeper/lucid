import { gameSound } from './sound';
import { PARK_K } from './grounds';
import './park-toys.css';

type Rect = { x: number; y: number; w: number; h: number };
export type ParkToyKind = 'tree' | 'bush' | 'pond' | 'fountain' | 'flowers';
export type ParkToy = { id: string; kind: ParkToyKind; x: number; y: number; rx: number; ry: number; index: number; label: string };

/** Match the existing park drawing's plan. The artwork remains in its bounded renderer. */
export function parkToySpots(park: Rect): ParkToy[] {
  const k = PARK_K, cx = park.x + park.w / 2, cy = park.y + park.h / 2;
  const pw = park.w / k, ph = park.h / k;
  const specs: [ParkToyKind, number, number, number, number, string][] = [
    ['tree', -pw / 2 + 110, -ph / 2 + 110, 64, 64, 'Shake the tree'],
    ['tree', pw / 2 - 120, ph / 2 - 120, 70, 70, 'Shake the tree'],
    ['tree', -320, -200, 58, 58, 'Shake the tree'],
    ['tree', pw / 2 - 110, -ph / 2 + 300, 54, 54, 'Shake the tree'],
    ['bush', -470, 230, 40, 40, 'Rustle the bush'],
    ['bush', -200, 420, 34, 34, 'Rustle the bush'],
    ['bush', 420, 220, 38, 38, 'Rustle the bush'],
    ['bush', 470, 260, 30, 30, 'Rustle the bush'],
    ['pond', 260, -120, 190, 120, 'Make ripples in the pond'],
    ['fountain', 0, 0, 70, 70, 'Splash the fountain'],
    ['flowers', -235, 193, 95, 26, 'Nudge the flowers'],
    ['flowers', 200, -280, 80, 24, 'Nudge the flowers'],
    ['flowers', 265, 352, 105, 24, 'Nudge the flowers'],
  ];
  const indices = new Map<ParkToyKind, number>();
  return specs.map(([kind, dx, dy, rx, ry, label]) => {
    const index = indices.get(kind) ?? 0; indices.set(kind, index + 1);
    return { id: `${kind}-${index}`, kind, x: cx + dx * k, y: cy + dy * k, rx: rx * k, ry: ry * k, index, label };
  });
}

export function hitParkToy(spots: ParkToy[], x: number, y: number) {
  return spots.find(s => ((x - s.x) / s.rx) ** 2 + ((y - s.y) / s.ry) ** 2 <= 1) ?? null;
}

/** Finite, user-triggered park effects, with no animation or layout polling loop. */
export class ParkToys {
  private spots: ParkToy[] = [];
  private buttons = new Map<string, HTMLButtonElement>();
  private effects = new Map<HTMLElement, Animation>();
  private shakes = new Set<Animation>();
  private presses = new Map<string, number>();
  private geometry = '';
  private lastAt = -1000;
  private dead = false;
  constructor(private layer: HTMLElement, private react: (kind: ParkToyKind, at: { x: number; y: number }) => void) {
    document.addEventListener('visibilitychange', this.visibility);
  }
  setGeometry(park: Rect) {
    if (this.dead) return;
    const key = `${park.x}:${park.y}:${park.w}:${park.h}`;
    if (key === this.geometry) return;
    this.geometry = key; this.clearEffects();
    this.spots = parkToySpots(park);
    for (const spot of this.spots) {
      let button = this.buttons.get(spot.id);
      if (!button) {
        button = document.createElement('button'); button.type = 'button'; button.className = 'park-toy';
        button.dataset.kind = spot.kind; button.dataset.toy = spot.id;
        button.setAttribute('aria-label', spot.label); button.title = spot.label;
        let start: { x: number; y: number } | null = null, dragged = false;
        // Let the existing camera own drag gestures. A release after a pan is
        // never interpreted as a shake or a splash.
        button.addEventListener('pointerdown', e => { if (e.button === 0) { start = { x: e.clientX, y: e.clientY }; dragged = false; } });
        button.addEventListener('pointermove', e => { if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5) dragged = true; });
        button.addEventListener('pointercancel', () => { dragged = true; });
        button.addEventListener('click', e => {
          e.stopPropagation();
          const moved = e.detail > 0 && (dragged || start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5);
          start = null;
          if (!moved) this.activate(spot.id);
        });
        button.addEventListener('dblclick', e => e.stopPropagation());
        this.layer.append(button); this.buttons.set(spot.id, button);
      }
      button.style.cssText = `left:${spot.x - spot.rx}px;top:${spot.y - spot.ry}px;width:${spot.rx * 2}px;height:${spot.ry * 2}px`;
    }
  }
  /** Compatibility for clicks reaching World's existing world-coordinate handler. */
  hit(x: number, y: number) {
    const spot = hitParkToy(this.spots, x, y);
    if (!spot) return false;
    this.activate(spot.id, { x, y }); return true;
  }
  private activate(id: string, point?: { x: number; y: number }) {
    if (this.dead || document.hidden) return;
    const spot = this.spots.find(s => s.id === id), button = this.buttons.get(id);
    const now = performance.now();
    if (!spot || !button || now - this.lastAt < 140) return;
    this.lastAt = now;
    const at = point ?? spot, count = (this.presses.get(id) ?? 0) + 1;
    this.presses.set(id, count);
    if (spot.kind === 'pond' || spot.kind === 'fountain') {
      gameSound.at('splash', button, .8);
      this.ripples(at.x, at.y, spot.kind === 'fountain');
      if (spot.kind === 'pond') { gameSound.at('quack', button, .65); this.duckHop(); }
    } else {
      gameSound.at('rustle', button, spot.kind === 'tree' ? .85 : .6);
      this.shake(spot);
      this.leaves(spot, spot.kind === 'flowers' ? 5 : 7);
      if (count % 3 === 0) { this.bird(spot); gameSound.at('chirp', button, .7); }
    }
    this.react(spot.kind, { x: at.x, y: at.y });
  }
  private get reduced() { return matchMedia('(prefers-reduced-motion: reduce)').matches; }
  private liveArt() { return this.layer.closest('.world')?.querySelector('.outside-live'); }
  private shake(spot: ParkToy) {
    if (this.reduced) return;
    const selector = spot.kind === 'tree' ? '.amb-tree, .amb-bare' : spot.kind === 'bush' ? '.amb-bush' : '.amb-fl';
    const targets = [...(this.liveArt()?.querySelectorAll(selector) ?? [])];
    const target = spot.kind === 'tree' || spot.kind === 'bush' ? targets.slice(-4)[spot.index] : targets.slice(-3)[spot.index];
    if (!target) return;
    this.trackShake(target.animate([{ translate: '0px 0px' }, { translate: '-4px -1px' }, { translate: '5px 1px' }, { translate: '-3px 0px' }, { translate: '1px 0px' }, { translate: '0px 0px' }], { duration: 580, easing: 'ease-out' }));
  }
  private duckHop() {
    if (this.reduced) return;
    const ducks = this.liveArt()?.querySelectorAll('.amb-rock, .amb-sit');
    for (const duck of [...(ducks ?? [])].slice(0, 4)) this.trackShake(duck.animate([{ translate: '0px 0px' }, { translate: '0px -6px' }, { translate: '0px 0px' }], { duration: 380, easing: 'ease-out' }));
  }
  private trackShake(animation: Animation) {
    if (this.shakes.size >= 12) this.shakes.values().next().value?.cancel();
    this.shakes.add(animation);
    const done = () => this.shakes.delete(animation);
    animation.onfinish = done; animation.oncancel = done;
  }
  private effect(x: number, y: number, className: string, markup: string, frames: Keyframe[], duration: number, delay = 0) {
    if (this.effects.size >= 36) {
      const oldest = this.effects.keys().next().value;
      if (oldest) { this.effects.get(oldest)?.cancel(); oldest.remove(); this.effects.delete(oldest); }
    }
    const el = document.createElement('span'); el.className = `park-effect ${className}`;
    el.setAttribute('aria-hidden', 'true'); el.style.left = `${x}px`; el.style.top = `${y}px`; el.innerHTML = markup;
    this.layer.append(el);
    const animation = el.animate(this.reduced ? [{ opacity: .75 }, { opacity: 0 }] : frames, { duration: this.reduced ? 250 : duration, delay: this.reduced ? 0 : delay, fill: 'both', easing: 'ease-out' });
    this.effects.set(el, animation);
    const done = () => { this.effects.delete(el); el.remove(); };
    animation.onfinish = done; animation.oncancel = done;
  }
  private ripples(x: number, y: number, fountain: boolean) {
    for (let i = 0; i < (this.reduced ? 1 : 3); i++) this.effect(x, y, 'park-ripple', '', [{ transform: 'translate(-50%,-50%) scale(.5)', opacity: .9 }, { transform: 'translate(-50%,-50%) scale(6)', opacity: 0 }], 900, i * 100);
    if (!fountain || this.reduced) return;
    for (let i = 0; i < 6; i++) {
      const dx = (i - 2.5) * 16, up = -32 - (3 - Math.abs(i - 2.5)) * 14;
      this.effect(x, y, 'park-droplet', '', [{ transform: 'translate(-50%,-50%)', opacity: .95 }, { transform: `translate(${dx}px,${up}px)`, opacity: .9, offset: .45 }, { transform: `translate(${dx * 1.35}px,12px)`, opacity: 0 }], 680, i * 15);
    }
  }
  private leaves(spot: ParkToy, count: number) {
    const season = this.liveArt()?.getAttribute('class') ?? '';
    const colors = season.includes('winter') ? ['#eef4f8', '#d3ebf5'] : season.includes('autumn') ? ['#e6a64c', '#bd7143', '#d7be63'] : ['#73b56d', '#9acb78', '#528d5a'];
    if (this.reduced) count = 2;
    for (let i = 0; i < count; i++) {
      const dx = (i - (count - 1) / 2) * 17;
      const leaf = `<svg viewBox="0 0 20 12" width="20" height="12"><path d="M1 9Q5-2 18 2Q16 14 1 9Z" fill="${colors[i % colors.length]}"/><path d="M2 9L15 4" stroke="#4c6d45" stroke-width=".8" opacity=".5"/></svg>`;
      this.effect(spot.x + dx, spot.y - spot.ry * .3, 'park-leaf', leaf, [{ transform: `translate(0,-4px) rotate(${i * 29}deg)`, opacity: 0 }, { opacity: 1, offset: .15 }, { transform: `translate(${dx * 1.2}px,${55 + i % 3 * 17}px) rotate(${90 + i * 39}deg)`, opacity: 0 }], 1000 + i * 45, i * 25);
    }
  }
  private bird(spot: ParkToy) {
    const svg = '<svg viewBox="0 0 30 24" width="30" height="24"><ellipse cx="15" cy="14" rx="7" ry="5" fill="#bba78e"/><path d="M12 13Q0 1 3 16L12 17M18 13Q29 1 27 16L18 17" fill="#8f7a62"/><circle cx="20" cy="10" r="4" fill="#bba78e"/><circle cx="21" cy="9" r="1" fill="#3a3f4f"/><path d="M24 10L29 12L24 13" fill="#e8a93a"/></svg>';
    this.effect(spot.x, spot.y - spot.ry * .4, 'park-bird', svg, [{ transform: 'translate(-15px,0) scale(.6)', opacity: 0 }, { transform: 'translate(-2px,-36px) scale(1)', opacity: 1, offset: .25 }, { transform: 'translate(86px,-120px) scale(.85)', opacity: 0 }], 1250);
  }
  private visibility = () => { if (document.hidden) this.clearEffects(); };
  private clearEffects() {
    for (const [el, animation] of this.effects) { animation.oncancel = null; animation.cancel(); el.remove(); }
    this.effects.clear();
    for (const animation of this.shakes) { animation.oncancel = null; animation.cancel(); }
    this.shakes.clear();
  }
  destroy() {
    if (this.dead) return;
    this.dead = true; this.clearEffects();
    document.removeEventListener('visibilitychange', this.visibility);
    for (const button of this.buttons.values()) button.remove();
    this.buttons.clear(); this.spots = [];
  }
}
