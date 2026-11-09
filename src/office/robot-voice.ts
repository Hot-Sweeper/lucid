// Robot voices. Robots never pronounce words: each line becomes a short run of synthesized
// syllables whose vowel color, consonant hiss and melody follow the actual letters, so a line
// "sounds like" what is written. Every robot keeps one voice wherever it appears, derived
// from its persistent name, its harness family and its head size.
import { gameSound, type SoundMix } from './sound';
import { brandFor, type BrandKind } from './brand';

export type VoiceProfile = {
  pitch: number; wave: OscillatorType; formant: number; rate: number;
  ring: number; ringDepth: number; vibrato: number; vibratoRate: number; glide: number; scale: number[]; bright: number;
  /** Output trim: soft waveforms pass less energy through the formant filters than buzzy ones. */
  level: number;
};
export type Syllable = {
  at: number; dur: number; pitch: number; f1: number; f2: number; gain: number; nasal: boolean;
  consonant: { band: number; dur: number; gain: number } | null;
  /** A closing consonant ("pass", "bit"), sounded near the end of the syllable. */
  coda: { band: number; dur: number; gain: number } | null;
};
export type SpeechPlan = { syllables: Syllable[]; length: number };
export type Speaker = { el: Element; seed: string; provider?: string | null; brand?: BrandKind; head?: number };

type Family = {
  pitch: [number, number]; wave: OscillatorType; formant: [number, number]; rate: [number, number];
  ring: [number, number]; ringDepth: number; vibrato: number; glide: number; scale: number[]; bright: number;
};
// Each harness family has its own kind of voice; the robot's name places it inside that range.
const FAMILIES: Record<BrandKind, Family> = {
  // warm and rounded, an unhurried pentatonic lilt
  claude: { pitch: [150, 225], wave: 'triangle', formant: [.95, 1.08], rate: [10.5, 12.5], ring: [0, 0], ringDepth: 0, vibrato: .018, glide: .035, scale: [0, 2, 4, 7, 9, 12], bright: .9 },
  // crisp and clipped, with a metallic ring
  codex: { pitch: [125, 185], wave: 'square', formant: [.9, 1.02], rate: [12.5, 14.5], ring: [46, 62], ringDepth: .45, vibrato: .006, glide: .012, scale: [0, 3, 5, 7, 10, 12], bright: 1 },
  // bright and sparkly
  gemini: { pitch: [210, 290], wave: 'sawtooth', formant: [1.06, 1.18], rate: [11.5, 13.5], ring: [0, 0], ringDepth: 0, vibrato: .022, glide: .04, scale: [0, 2, 4, 6, 7, 11, 12], bright: 1.1 },
  // low and gravelly
  grok: { pitch: [88, 130], wave: 'square', formant: [.82, .92], rate: [10, 12], ring: [28, 38], ringDepth: .55, vibrato: .01, glide: .02, scale: [0, 3, 5, 6, 7, 10], bright: .8 },
  // light and floaty, long glides
  antigravity: { pitch: [230, 320], wave: 'sine', formant: [1.05, 1.15], rate: [9, 10.5], ring: [0, 0], ringDepth: 0, vibrato: .03, glide: .07, scale: [0, 2, 5, 7, 9, 12], bright: 1 },
  // chiptune bits, fast arpeggio steps
  opencode: { pitch: [160, 230], wave: 'square', formant: [1, 1.1], rate: [13, 15], ring: [70, 90], ringDepth: .3, vibrato: .004, glide: .008, scale: [0, 4, 7, 12], bright: 1 },
  // high and sing-song
  muse: { pitch: [260, 360], wave: 'triangle', formant: [1.1, 1.22], rate: [10, 11.5], ring: [0, 0], ringDepth: 0, vibrato: .035, glide: .05, scale: [0, 2, 4, 5, 7, 9, 11, 12], bright: 1.05 },
  generic: { pitch: [140, 210], wave: 'sawtooth', formant: [.95, 1.05], rate: [11, 13], ring: [36, 50], ringDepth: .35, vibrato: .012, glide: .025, scale: [0, 2, 3, 7, 8, 12], bright: .95 },
};
// First and second formants of each vowel, before the robot's own formant shift.
const VOWELS: Record<string, [number, number]> = { a: [780, 1250], e: [500, 1900], i: [320, 2350], o: [520, 900], u: [360, 780], y: [330, 2050] };
const VOWEL_KEYS = 'aeiou';
const MAX_SECONDS = 2.6, MAX_SYLLABLES = 30, MAX_TALKERS = 3;

const hash = (value: string) => { let h = 2166136261; for (const c of value) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const unit = (seed: number, salt: number) => (hash(`${seed}:${salt}`) % 10000) / 10000;
const lerp = (range: [number, number], t: number) => range[0] + (range[1] - range[0]) * t;

/** One stable voice per robot: same name and family, same voice at the desk, in the park or the break room. */
export function voiceFor(seed: string, brand: BrandKind, head = 1): VoiceProfile {
  const f = FAMILIES[brand] ?? FAMILIES.generic, s = hash(seed || brand);
  const size = Math.min(1.15, Math.max(.9, Number.isFinite(head) ? head : 1));
  return {
    pitch: lerp(f.pitch, unit(s, 1)) / Math.pow(size, 1.4), wave: f.wave, formant: lerp(f.formant, unit(s, 2)) / Math.pow(size, .5),
    rate: lerp(f.rate, unit(s, 3)), ring: lerp(f.ring, unit(s, 4)), ringDepth: f.ringDepth, vibrato: f.vibrato,
    vibratoRate: 4.6 + unit(s, 5) * 2.4, glide: f.glide, scale: f.scale, bright: f.bright,
    level: ({ sine: 2.3, triangle: 2.1, square: 1.45, sawtooth: 1.2 } as Record<string, number>)[f.wave] ?? 1.4,
  };
}

function consonantFor(letters: string): Syllable['consonant'] {
  if (!letters) return null;
  if (/sh|ch|j/.test(letters)) return { band: 3100, dur: .06, gain: .09 };
  if (/[szcx]/.test(letters)) return { band: 6400, dur: .05, gain: .075 };
  if (/th|ph|[fvhw]/.test(letters)) return { band: 1900, dur: .04, gain: .045 };
  if (/[tdkgpbq]/.test(letters)) { const hard = /[tkpq]/.test(letters); return { band: hard ? 2600 : 1300, dur: .018, gain: hard ? .12 : .09 }; }
  return null;
}

/** Turns a line into timed syllables. Pure, so it can be checked without an audio device. */
export function speechPlan(text: string, voice: VoiceProfile): SpeechPlan {
  const clean = String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  type Token = { kind: 'syl'; text: string; stress: boolean } | { kind: 'gap'; seconds: number; end?: '?' | '!' | '.' };
  const tokens: Token[] = [];
  const flush = (word: string) => {
    if (!word) return;
    // Consonants lead into the next syllable; trailing ones stay with the last. "hmm" is one hum.
    const parts = word.match(/[^aeiouy]*[aeiouy]+(?:[^aeiouy]+$)?/g) ?? [word];
    parts.forEach((part, index) => tokens.push({ kind: 'syl', text: part, stress: index === 0 && parts.length > 1 }));
  };
  let word = '';
  for (const ch of clean) {
    if (/[a-z]/.test(ch)) { word += ch; continue; }
    flush(word); word = '';
    if (/\d/.test(ch)) tokens.push({ kind: 'syl', text: `i${ch}`, stress: false });
    else if (/\p{L}/u.test(ch)) tokens.push({ kind: 'syl', text: VOWEL_KEYS[ch.codePointAt(0)! % 5] + ch, stress: false });
    else if (/[,;:]/.test(ch)) tokens.push({ kind: 'gap', seconds: .13 });
    else if (/[.!?…]/.test(ch)) tokens.push({ kind: 'gap', seconds: .22, end: ch === '?' ? '?' : ch === '!' ? '!' : '.' });
    else if (/\s|[-/]/.test(ch)) tokens.push({ kind: 'gap', seconds: .04 });
  }
  flush(word);

  const syllables: Syllable[] = [];
  const base = 1 / Math.max(6, voice.rate);
  // Sentence ends shape the melody: questions rise, exclamations lift and get louder.
  let sentenceStart = 0, t = 0;
  const closeSentence = (end: '?' | '!' | '.' | undefined) => {
    const group = syllables.slice(sentenceStart);
    group.forEach((s, i) => { s.pitch *= Math.pow(2, (-1.2 * i / Math.max(1, group.length)) / 12); });
    if (end === '?' && group.length) { const last = group[group.length - 1]; last.pitch *= Math.pow(2, 5 / 12); last.dur *= 1.35; if (group.length > 1) group[group.length - 2].pitch *= Math.pow(2, 2 / 12); }
    if (end === '!') for (const s of group) { s.gain = Math.min(.24, s.gain * 1.22); s.pitch *= Math.pow(2, 2 / 12); }
    sentenceStart = syllables.length;
  };
  for (const token of tokens) {
    if (syllables.length >= MAX_SYLLABLES || t >= MAX_SECONDS) break;
    if (token.kind === 'gap') {
      if (syllables.length) t += token.seconds;
      if (token.end) closeSentence(token.end);
      continue;
    }
    const nucleus = token.text.match(/[aeiouy]/)?.[0] ?? 'u';
    const onset = token.text.slice(0, Math.max(0, token.text.search(/[aeiouy]/)));
    const [f1, f2] = VOWELS[nucleus];
    const consonant = consonantFor(onset || (/[aeiouy]/.test(token.text) ? '' : token.text));
    const tail = token.text.match(/[aeiouy]([^aeiouy]+)$/)?.[1] ?? '';
    const coda = tail ? consonantFor(tail) : null;
    // The same syllable always lands on the same note, which makes the babble feel like a language.
    const degree = voice.scale[hash(token.text) % voice.scale.length] - 5 + (token.stress ? 1 : 0);
    const dur = Math.min(.17, Math.max(.055, base * (.72 + .1 * token.text.length)));
    syllables.push({
      at: t + (consonant ? consonant.dur * .6 : 0), dur, pitch: voice.pitch * Math.pow(2, degree / 12),
      f1: f1 * voice.formant, f2: f2 * voice.formant, gain: token.stress ? .17 : .145,
      nasal: /^[mnlr]/.test(onset) || !/[aeiouy]/.test(token.text), consonant,
      coda: coda ? { ...coda, gain: coda.gain * .8 } : null,
    });
    t = syllables[syllables.length - 1].at + dur + .014 + (coda ? coda.dur * .7 : 0);
  }
  closeSentence(undefined);
  // `at` already includes the consonant lead-in, so a consonant starts at at - lead.
  const last = syllables[syllables.length - 1];
  return { syllables, length: last ? last.at + last.dur + (last.coda ? last.coda.dur * .7 : 0) : 0 };
}

/** Builds one utterance as a single continuous voice: an oscillator through moving formant filters. */
function renderPlan(ctx: AudioContext, input: AudioNode, noise: AudioBuffer, plan: SpeechPlan, voice: VoiceProfile) {
  const start = ctx.currentTime + .02, end = start + plan.length + .1;
  const first = plan.syllables[0];
  const osc = ctx.createOscillator(); osc.type = voice.wave; osc.frequency.value = first.pitch;
  const vibrato = ctx.createOscillator(), vibratoDepth = ctx.createGain();
  vibrato.frequency.value = voice.vibratoRate; vibratoDepth.gain.value = voice.pitch * voice.vibrato;
  vibrato.connect(vibratoDepth); vibratoDepth.connect(osc.frequency);
  const band = (type: BiquadFilterType, frequency: number, q: number) => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = frequency; f.Q.value = q; return f; };
  const level = (value: number) => { const g = ctx.createGain(); g.gain.value = value; return g; };
  const f1 = band('bandpass', first.f1, 5), f2 = band('bandpass', first.f2, 7), body = band('lowpass', 2600 * voice.bright, .4);
  const envelope = level(0), ring = level(1), trim = level(voice.level);
  osc.connect(f1).connect(level(1.7)).connect(envelope);
  osc.connect(f2).connect(level(1.05 * voice.bright)).connect(envelope);
  osc.connect(body).connect(level(.16)).connect(envelope);
  envelope.connect(ring).connect(trim).connect(input);
  const sources: AudioScheduledSourceNode[] = [osc, vibrato];
  if (voice.ringDepth > 0 && voice.ring > 0) {
    // Amplitude ring modulation gives the metallic robot buzz.
    const lfo = ctx.createOscillator(), depth = level(voice.ringDepth / 2);
    ring.gain.value = 1 - voice.ringDepth / 2; lfo.frequency.value = voice.ring;
    lfo.connect(depth).connect(ring.gain); sources.push(lfo);
  }
  const hiss = ctx.createBufferSource(); hiss.buffer = noise; hiss.loop = true;
  const hissColor = band('bandpass', 4000, 1.4), hissEnvelope = level(0);
  hiss.connect(hissColor).connect(hissEnvelope).connect(trim);
  sources.push(hiss);
  const glide = Math.max(.004, voice.glide / 3);
  for (const s of plan.syllables) {
    const at = start + s.at;
    osc.frequency.setTargetAtTime(s.pitch, at - .01, glide);
    if (s.nasal) { f1.frequency.setValueAtTime(280 * voice.formant, at); f2.frequency.setValueAtTime(1150 * voice.formant, at); }
    f1.frequency.setTargetAtTime(s.f1, at + (s.nasal ? s.dur * .3 : 0), .012);
    f2.frequency.setTargetAtTime(s.f2, at + (s.nasal ? s.dur * .3 : 0), .012);
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(s.gain, at + .012);
    envelope.gain.linearRampToValueAtTime(s.gain * .72, at + s.dur * .72);
    envelope.gain.linearRampToValueAtTime(0, at + s.dur);
    const hissAt = (c: NonNullable<Syllable['consonant']>, from: number) => {
      hissColor.frequency.setValueAtTime(c.band, from);
      hissEnvelope.gain.setValueAtTime(0, from);
      hissEnvelope.gain.linearRampToValueAtTime(c.gain, from + .004);
      hissEnvelope.gain.linearRampToValueAtTime(0, from + c.dur);
    };
    if (s.consonant) hissAt(s.consonant, at - s.consonant.dur * .6);
    if (s.coda) hissAt(s.coda, at + s.dur * .7);
  }
  for (const source of sources) { source.start(start); source.stop(end); }
  return sources;
}

const talking = new Map<string, number>();

/** A robot says a line out loud. Thought bubbles stay silent; quiet or far robots stay quiet. */
export function robotSay(speaker: Speaker, text: string, intensity = 1): boolean {
  if (!gameSound.active || !text || !speaker.el.isConnected || !speaker.el.closest('.scene')) return false;
  const placed = gameSound.placement(speaker.el, intensity);
  if (!placed) return false;
  const now = gameSound.time;
  for (const [key, until] of talking) if (until <= now) talking.delete(key);
  const owner = `voice:${speaker.seed}`;
  // Robots interrupt themselves; the office only carries a few voices at once.
  if (talking.has(owner)) gameSound.silence(owner);
  else if (talking.size >= MAX_TALKERS) return false;
  const voice = voiceFor(speaker.seed, speaker.brand ?? brandFor(speaker.provider), speaker.head);
  const plan = speechPlan(text, voice);
  if (!plan.syllables.length) return false;
  const mix: SoundMix = { ...placed.mix, lowpass: Math.min(placed.mix.lowpass ?? 14000, 9000) };
  const sources = voice.ringDepth > 0 ? 4 : 3;
  const ok = gameSound.synth(mix, owner, sources, (ctx, input, noise) => renderPlan(ctx, input, noise, plan, voice));
  if (ok) talking.set(owner, now + plan.length + .15);
  return ok;
}

/** For offline rendering and checks: the same voice graph, without the live office. */
export const voiceInternals = { renderPlan, FAMILIES };
