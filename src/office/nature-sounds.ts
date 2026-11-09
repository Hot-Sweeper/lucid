// Outdoor phrases for the park, generated fresh each time so no two birds repeat exactly.
// The time of day and the real weather choose who is singing; the soundscape decides
// whether the camera is close enough to hear it.
import type { Note } from './sound';

export type Daypart = 'dawn' | 'day' | 'dusk' | 'night';
export type NatureVoice = 'warble' | 'trill' | 'whistle' | 'coo' | 'fluty' | 'crickets' | 'owl' | 'frogs' | 'rain' | 'wind' | 'thunder' | 'bees';
type Rand = () => number;

/** Uses the office's own sky (`night` is the visible darkness, 0 to .9) so sound matches the picture. */
export function daypart(hour: number, night: number): Daypart {
  if (!Number.isFinite(hour)) return 'day';
  if (Number.isFinite(night) && night >= .5) return 'night';
  const dim = Number.isFinite(night) && night > .05;
  if (hour < 3) return 'night';
  if (hour < 11) return dim || hour < 8.5 ? 'dawn' : 'day';
  if (hour >= 16) return dim || hour >= 18.5 ? 'dusk' : 'day';
  return 'day';
}

/** Which creatures sing near a tree, a pond or the meadow, and how often (seconds). */
export function natureFor(zone: 'birds' | 'pond' | 'meadow', part: Daypart, wet: boolean): { voice: NatureVoice; interval: number }[] {
  if (wet) return zone === 'pond' && part !== 'day' ? [{ voice: 'frogs', interval: 3.4 }] : [];
  if (zone === 'birds') return part === 'dawn' ? [{ voice: 'warble', interval: 1.5 }, { voice: 'trill', interval: 3.1 }]
    : part === 'day' ? [{ voice: 'whistle', interval: 4.6 }, { voice: 'coo', interval: 9.5 }]
    : part === 'dusk' ? [{ voice: 'fluty', interval: 3.6 }]
    : [{ voice: 'owl', interval: 13 }];
  if (zone === 'pond') return part === 'night' || part === 'dusk' ? [{ voice: 'frogs', interval: 2.6 }] : [];
  return part === 'night' || part === 'dusk' ? [{ voice: 'crickets', interval: .95 }] : part === 'day' ? [{ voice: 'bees', interval: 5.5 }] : [];
}

const between = (r: Rand, lo: number, hi: number) => lo + (hi - lo) * r();
const count = (r: Rand, lo: number, hi: number) => Math.floor(between(r, lo, hi + 1));

/** A fresh phrase for one voice. Every note is a short transient; nothing loops. */
export function naturePhrase(voice: NatureVoice, r: Rand = Math.random): Note[] {
  const notes: Note[] = [];
  let t = 0;
  switch (voice) {
    case 'warble': {
      // a busy songbird: quick rising and falling notes
      const base = between(r, 2400, 3600);
      for (let i = count(r, 5, 9); i > 0; i--) {
        const f = base * between(r, .75, 1.3), d = between(r, .045, .1);
        notes.push([f, t, d, between(r, .065, .1), 'sine', f * between(r, .7, 1.4)]);
        t += d + between(r, .015, .05);
      }
      break;
    }
    case 'trill': {
      const f = between(r, 3600, 4600), d = between(r, .028, .04), gap = between(r, .045, .065);
      for (let i = count(r, 8, 14); i > 0; i--) { notes.push([f, t, d, .065, 'sine', f * .8]); t += gap; }
      break;
    }
    case 'whistle': {
      // a two-note "tee-tuu", said two or three times
      const hi = between(r, 2700, 3300), lo = hi * between(r, .74, .84);
      for (let i = count(r, 2, 3); i > 0; i--) { notes.push([hi, t, .14, .085, 'sine', hi * 1.02], [lo, t + .19, .17, .075, 'sine', lo * .98]); t += .5; }
      break;
    }
    case 'coo': {
      // a dove somewhere in the trees
      const f = between(r, 480, 560);
      notes.push([f, 0, .32, .1, 'triangle', f * .92, 900], [f * 1.06, .42, .5, .11, 'triangle', f * .88, 900], [f * .94, 1.05, .34, .09, 'triangle', f * .86, 900]);
      break;
    }
    case 'fluty': {
      // an evening song: lower, longer, sliding notes
      for (let i = count(r, 4, 7); i > 0; i--) {
        const f = between(r, 1300, 2600), d = between(r, .1, .24);
        notes.push([f, t, d, between(r, .06, .09), 'sine', f * between(r, .85, 1.25)]);
        t += d + between(r, .03, .09);
      }
      break;
    }
    case 'crickets': {
      for (const [f, offset] of [[between(r, 4300, 4700), 0], [between(r, 4900, 5300), between(r, .18, .4)]]) {
        for (let i = 0; i < 3; i++) notes.push([f, offset + i * .052, .03, .032, 'sine']);
      }
      break;
    }
    case 'owl': {
      const f = between(r, 340, 400);
      notes.push([f, 0, .42, .11, 'sine', f * .95], [f * 1.02, .75, .2, .09, 'sine', f * .97], [f, 1.0, .5, .1, 'sine', f * .92]);
      break;
    }
    case 'frogs': {
      const f = between(r, 260, 340);
      for (let i = count(r, 1, 3); i > 0; i--) { notes.push([f, t, .07, .09, 'triangle', f * .62, 600], [f * .95, t + .09, .08, .08, 'triangle', f * .6, 600]); t += between(r, .3, .5); }
      break;
    }
    case 'bees': {
      const f = between(r, 210, 250);
      notes.push([f, 0, .7, .02, 'sawtooth', f * 1.08, 480], [f * 1.03, .5, .6, .017, 'sawtooth', f * .96, 480]);
      break;
    }
    case 'rain': {
      // drops on leaves and paving, with the odd bright drip into a puddle
      for (let i = count(r, 6, 10); i > 0; i--) notes.push([0, between(r, 0, .24), between(r, .012, .03), between(r, .04, .08), 'sine', undefined, between(r, 2400, 7200)]);
      if (r() < .35) { const f = between(r, 1700, 3200); notes.push([f, between(r, 0, .2), .05, .035, 'sine', f * 1.35]); }
      break;
    }
    case 'wind': {
      // a gust swells and fades through overlapping soft noise
      const band = between(r, 380, 700);
      [[0, .03], [.35, .055], [.7, .07], [1.05, .05], [1.4, .028]].forEach(([at, gain]) => notes.push([0, at, 1.5, gain, 'sine', undefined, band * between(r, .85, 1.25)]));
      break;
    }
    case 'thunder': {
      notes.push([0, 0, 2.6, .22, 'sine', undefined, 110], [0, .08, 2.2, .16, 'sine', undefined, 260], [0, .5, 1.8, .11, 'sine', undefined, 180], [52, 0, 2.2, .1, 'triangle', 38]);
      break;
    }
  }
  return notes;
}
