import { gameSound } from './sound';
import { PARK_K } from './grounds';
import { PARK_LAYOUT } from './outside';
import './park-toys.css';

// Click the park itself: there are no buttons or hit zones on screen. A click is matched
// against where things are drawn (outside.ts PARK_LAYOUT): the water ripples exactly where you
// clicked, a tree sways and drops leaves, a lamp switches, flowers puff petals.

type Rect = { x: number; y: number; w: number; h: number };
export type ParkToyKind = 'tree' | 'bush' | 'pond' | 'fountain' | 'flowers';
type Target =
  | { kind: 'tree' | 'bush' | 'flowers'; key: string; x: number; y: number; r: number; top: number }
  | { kind: 'pond' | 'fountain'; x: number; y: number }
  | { kind: 'lamp'; index: number; x: number; y: number };
export type ParkSpot = { kind: Target['kind']; x: number; y: number; rx: number; ry: number; key: string };

/** Everything clickable in a park, in world coordinates (for checks and hit testing). */
export function parkSpots(park: Rect): ParkSpot[] {
  const k = PARK_K, cx = park.x + park.w / 2, cy = park.y + park.h / 2, at = (x: number, y: number) => ({ x: cx + x * k, y: cy + y * k });
  const L = PARK_LAYOUT;
  return [
    // lamps first: the post and head are small and stand over other things
    ...L.lamps.map(([x, y], i) => ({ kind: 'lamp' as const, key: `l${i}`, ...at(x, y - 34), rx: 24 * k, ry: 46 * k })),
    { kind: 'fountain', key: 'fountain', ...at(L.fountain.x, L.fountain.y), rx: L.fountain.r * k, ry: L.fountain.r * k },
    { kind: 'pond', key: 'pond', ...at(L.pond.x, L.pond.y), rx: L.pond.rx * k, ry: L.pond.ry * k },
    ...L.trees.map(([x, y, r], i) => ({ kind: 'tree' as const, key: `t${i}`, ...at(x, y), rx: r * 1.05 * k, ry: r * 1.05 * k })),
    ...L.bushes.map(([x, y, r], i) => ({ kind: 'bush' as const, key: `b${i}`, ...at(x, y), rx: r * k, ry: r * k })),
    ...L.hedge.map(([x, y, r], i) => ({ kind: 'bush' as const, key: `h${i}`, ...at(x, y), rx: r * 1.1 * k, ry: r * 1.1 * k })),
    ...L.beds.map(([x, y, rx, ry], i) => ({ kind: 'flowers' as const, key: `f${i}`, ...at(x, y), rx: (rx + 10) * k, ry: (ry + 10) * k })),
  ];
}
export function hitParkSpot(spots: ParkSpot[], x: number, y: number) {
  return spots.find(s => ((x - s.x) / s.rx) ** 2 + ((y - s.y) / s.ry) ** 2 <= 1) ?? null;
}

/** Finite, user-triggered park effects, with no animation or layout polling loop. */
export class ParkToys {
  private spots: ParkSpot[] = [];
  private effects = new Map<HTMLElement, Animation>();
  private shakes = new Map<Element, Animation>();
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
    this.spots = parkSpots(park);
  }
  /** A click at world (x, y). Returns true when something in the park answered it. */
  hit(x: number, y: number) {
    if (this.dead || document.hidden) return false;
    const spot = hitParkSpot(this.spots, x, y);
    if (!spot) return false;
    const now = performance.now();
    if (now - this.lastAt < 90) return true;
    this.lastAt = now;
    const count = (this.presses.get(spot.key) ?? 0) + 1;
    this.presses.set(spot.key, count);
    const at = { x, y };
    switch (spot.kind) {
      case 'lamp': this.toggleLamp(spot.key); break;
      case 'pond': case 'fountain':
        this.splash(x, y, spot.kind === 'fountain');
        if (spot.kind === 'pond' && count % 3 === 0) { gameSound.at('quack', this.layer, .65); this.duckHop(); }
        break;
      case 'tree': case 'bush':
        gameSound.at('rustle', this.layer, spot.kind === 'tree' ? .85 : .55);
        this.sway(spot.key, spot.kind === 'tree' ? 3.2 : 4.5);
        this.leaves(x, spot.kind === 'tree' ? spot.y - spot.ry * .35 : y - 6, spot.kind === 'tree' ? 8 : 4);
        if (spot.kind === 'tree' && count % 3 === 0) { this.flyer(spot.x, spot.y - spot.ry * .5, 'bird'); gameSound.at('chirp', this.layer, .7); }
        break;
      case 'flowers':
        gameSound.at('rustle', this.layer, .4);
        this.sway(spot.key, 1.6);
        this.petals(x, y);
        if (count % 2 === 0) this.flyer(x, y, 'butterfly');
        break;
    }
    if (spot.kind !== 'lamp') this.react(spot.kind, at);
    return true;
  }
  /** Water elsewhere in the world (the forest stream): the same ripples and splash. */
  splashAt(x: number, y: number) { if (!this.dead && !document.hidden) this.splash(x, y, false); }
  /** A forest tree outside the park: leaves shake loose where it was clicked. */
  rustleAt(x: number, y: number) {
    if (this.dead || document.hidden) return;
    gameSound.at('rustle', this.layer, .7);
    this.leaves(x, y - 10, 7);
  }

  private get reduced() { return matchMedia('(prefers-reduced-motion: reduce)').matches; }
  private art(selector: string) { return this.layer.closest('.world')?.querySelector(selector) ?? null; }
  private toggleLamp(key: string) {
    const lamp = this.art(`.outside-lights .park-lamp[data-lamp="${key.slice(1)}"]`);
    if (!lamp) return;
    // lit means: forced on, or following an evening light that is up
    const world = this.layer.closest('.world') as HTMLElement | null;
    const evening = parseFloat(world ? getComputedStyle(world).getPropertyValue('--lamp') : '0') > .3;
    const lit = lamp.classList.contains('on') || (evening && !lamp.classList.contains('off'));
    lamp.classList.toggle('on', !lit);
    lamp.classList.toggle('off', lit);
    gameSound.at('switch', this.layer, .6);
  }
  private sway(key: string, deg: number) {
    if (this.reduced) return;
    const el = this.art(`.outside-plain .park-sway[data-sway="${key}"]`);
    if (!el) return;
    this.shakes.get(el)?.cancel();
    const a = el.animate([
      { transform: 'rotate(0deg)' }, { transform: `rotate(${-deg}deg)` }, { transform: `rotate(${deg * .8}deg)` },
      { transform: `rotate(${-deg * .45}deg)` }, { transform: `rotate(${deg * .2}deg)` }, { transform: 'rotate(0deg)' },
    ], { duration: 900, easing: 'ease-out' });
    this.shakes.set(el, a);
    const done = () => { if (this.shakes.get(el) === a) this.shakes.delete(el); };
    a.onfinish = done; a.oncancel = done;
  }
  private duckHop() {
    if (this.reduced) return;
    const ducks = this.layer.closest('.world')?.querySelectorAll('.amb-rock, .amb-sit');
    for (const duck of [...(ducks ?? [])].slice(0, 4)) duck.animate([{ translate: '0px 0px' }, { translate: '0px -6px' }, { translate: '0px 0px' }], { duration: 380, easing: 'ease-out' });
  }
  private effect(x: number, y: number, className: string, markup: string, frames: Keyframe[], duration: number, delay = 0, style = '') {
    if (this.effects.size >= 48) {
      const oldest = this.effects.keys().next().value;
      if (oldest) { this.effects.get(oldest)?.cancel(); oldest.remove(); this.effects.delete(oldest); }
    }
    const el = document.createElement('span'); el.className = `park-effect ${className}`;
    el.setAttribute('aria-hidden', 'true'); el.style.cssText = `left:${x}px;top:${y}px;${style}`; el.innerHTML = markup;
    this.layer.append(el);
    const animation = el.animate(this.reduced ? [{ opacity: .75 }, { opacity: 0 }] : frames, { duration: this.reduced ? 250 : duration, delay: this.reduced ? 0 : delay, fill: 'both', easing: 'ease-out' });
    this.effects.set(el, animation);
    const done = () => { this.effects.delete(el); el.remove(); };
    animation.onfinish = done; animation.oncancel = done;
  }
  private splash(x: number, y: number, fountain: boolean) {
    gameSound.at('splash', this.layer, fountain ? .8 : .6);
    for (let i = 0; i < (this.reduced ? 1 : 3); i++) this.effect(x, y, 'park-ripple', '', [{ transform: 'translate(-50%,-50%) scale(.4)', opacity: .95 }, { transform: 'translate(-50%,-50%) scale(5.5)', opacity: 0 }], 1100, i * 160);
    if (this.reduced) return;
    const n = fountain ? 7 : 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * .5, dist = (fountain ? 26 : 16) + Math.random() * 12, up = (fountain ? 40 : 22) + Math.random() * 14;
      const dx = Math.cos(a) * dist, dy = Math.sin(a) * dist * .5;
      this.effect(x, y, 'park-droplet', '', [{ transform: 'translate(-50%,-50%) scale(.8)', opacity: .95 }, { transform: `translate(${dx * .6 - 3}px,${dy * .6 - up}px)`, opacity: .9, offset: .4 }, { transform: `translate(${dx - 3}px,${dy}px) scale(.6)`, opacity: 0 }], 620, i * 12);
    }
  }
  private leafColors() {
    const season = this.art('.outside-live')?.getAttribute('class') ?? '';
    const month = new Date().getMonth();
    const autumn = season.includes('autumn') || month >= 8 && month <= 10, winter = season.includes('winter') || month === 11 || month <= 1;
    return winter ? ['#eef4f8', '#d3ebf5'] : autumn ? ['#e6a64c', '#bd7143', '#d7be63', '#c9622e'] : ['#73b56d', '#9acb78', '#528d5a'];
  }
  private leaves(x: number, y: number, count: number) {
    const colors = this.leafColors();
    if (this.reduced) count = 2;
    for (let i = 0; i < count; i++) {
      const dx = (Math.random() - .5) * 60, drop = 50 + Math.random() * 45, turn = 120 + Math.random() * 260;
      const leaf = `<svg viewBox="0 0 20 12" width="20" height="12"><path d="M1 9Q5-2 18 2Q16 14 1 9Z" fill="${colors[i % colors.length]}"/><path d="M2 9L15 4" stroke="#4c3a25" stroke-width=".8" opacity=".45"/></svg>`;
      this.effect(x + dx * .3, y, 'park-leaf', leaf, [
        { transform: `translate(-50%,-50%) rotate(${i * 47}deg) scale(.8)`, opacity: 0 }, { opacity: 1, offset: .12 },
        { transform: `translate(${dx * .6}px,${drop * .5}px) rotate(${i * 47 + turn * .5}deg) scaleX(.4)`, offset: .55 },
        { transform: `translate(${dx}px,${drop}px) rotate(${i * 47 + turn}deg)`, opacity: 0 },
      ], 1300 + Math.random() * 500, i * 40);
    }
  }
  private petals(x: number, y: number) {
    const colors = ['#ffc2d6', '#ffe3ec', '#fff3c4', '#d7b8ff', '#ff9fb4'];
    for (let i = 0; i < (this.reduced ? 2 : 9); i++) {
      const a = Math.random() * Math.PI * 2, d = 20 + Math.random() * 30;
      this.effect(x, y, 'park-petal', '', [
        { transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 }, { opacity: 1, offset: .15 },
        { transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d * .6 - 28}px) rotate(${Math.random() * 300}deg)`, opacity: .9, offset: .55 },
        { transform: `translate(${Math.cos(a) * d * 1.3}px,${Math.sin(a) * d * .6 + 6}px) rotate(${Math.random() * 500}deg)`, opacity: 0 },
      ], 1100 + Math.random() * 300, i * 25, `background:${colors[i % colors.length]}`);
    }
  }
  private flyer(x: number, y: number, kind: 'bird' | 'butterfly') {
    const svg = kind === 'bird'
      ? '<svg viewBox="0 0 30 24" width="30" height="24"><ellipse cx="15" cy="14" rx="7" ry="5" fill="#bba78e"/><path d="M12 13Q0 1 3 16L12 17M18 13Q29 1 27 16L18 17" fill="#8f7a62"/><circle cx="20" cy="10" r="4" fill="#bba78e"/><circle cx="21" cy="9" r="1" fill="#3a3f4f"/><path d="M24 10L29 12L24 13" fill="#e8a93a"/></svg>'
      : '<svg viewBox="0 0 30 24" width="30" height="24"><path d="M15 12Q6 0 3 7Q2 14 15 13Q4 18 9 22Q13 22 15 14Q17 22 21 22Q26 18 15 13Q28 14 27 7Q24 0 15 12Z" fill="#f2a65a"/><path d="M15 6V19" stroke="#3a2e28" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="8" r="1.6" fill="#fff4dc"/><circle cx="22" cy="8" r="1.6" fill="#fff4dc"/></svg>';
    const dir = Math.random() < .5 ? -1 : 1;
    this.effect(x, y, kind === 'bird' ? 'park-bird' : 'park-butterfly', svg, kind === 'bird'
      ? [{ transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 }, { transform: `translate(${dir * 10 - 15}px,-36px) scale(1)`, opacity: 1, offset: .25 }, { transform: `translate(${dir * 90 - 15}px,-120px) scale(.85)`, opacity: 0 }]
      : [{ transform: 'translate(-50%,-50%) scale(.4)', opacity: 0 }, { transform: `translate(${dir * 18 - 15}px,-30px) scale(.9,1)`, opacity: 1, offset: .2 }, { transform: `translate(${dir * 30 - 15}px,-44px) scale(.35,1)`, offset: .35 }, { transform: `translate(${dir * 55 - 15}px,-62px) scale(.9,1)`, offset: .55 }, { transform: `translate(${dir * 110 - 15}px,-110px) scale(.5,1)`, opacity: 0 }],
      kind === 'bird' ? 1250 : 1900);
  }
  private visibility = () => { if (document.hidden) this.clearEffects(); };
  private clearEffects() {
    for (const [el, animation] of this.effects) { animation.oncancel = null; animation.cancel(); el.remove(); }
    this.effects.clear();
    for (const animation of this.shakes.values()) { animation.oncancel = null; animation.cancel(); }
    this.shakes.clear();
  }
  destroy() {
    if (this.dead) return;
    this.dead = true; this.clearEffects();
    document.removeEventListener('visibilitychange', this.visibility);
    this.spots = [];
  }
}
