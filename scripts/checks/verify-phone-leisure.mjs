import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';

// Robots' phone time: the thumb gesture, the original BotTube Shorts clips, the phone yielding to
// work at once, phone reactions (with a neighbour for "show") and the robot layer staying above
// the held phone so hats, headphones and accessories remain visible in every phone pose.
const src = (file) => readFile(new URL(`../../src/${file}`, import.meta.url), 'utf8');
const strip = (code) => code.replace(/^import\s[\s\S]*?;\r?\n/gm, '').replace(/^export\s*\{[^}]*\}(\s*from\s*"[^"]*")?;?\r?\n/gm, '').replace(/^export /gm, '');
const compile = async (file) => (await transformWithOxc(strip(await src(file)), file)).code;
const load = async (code, names) => import('data:text/javascript;base64,' + Buffer.from(`${code}\nexport { ${names} };`).toString('base64'));

// ---- the swipe gesture
const gesture = await load(await compile('fun/feed-gesture.ts'), 'swipeMotion, flick, FLICK_RELEASE');
{
  const travel = 0.46, dragMs = 240;
  const run = gesture.swipeMotion(travel, dragMs, true);
  assert.equal(run.at(0), 0, 'a swipe starts where the clip is');
  let last = -1, peak = 0;
  for (let ms = 0; ms <= dragMs; ms += 4) { const x = run.at(ms); assert.ok(x >= last - 1e-9, 'the content follows the thumb without moving backwards'); last = x; }
  assert.ok(Math.abs(run.at(dragMs - 0.01) - travel) < 1e-3, 'the drag ends where the thumb lets go');
  const before = (run.at(dragMs) - run.at(dragMs - 2)) / 2, after = (run.at(dragMs + 2) - run.at(dragMs)) / 2;
  assert.ok(Math.abs(before - after) / before < 0.12, `release keeps its speed into the spring (${before.toFixed(4)} vs ${after.toFixed(4)})`);
  for (let ms = dragMs; ms <= run.total + 50; ms += 4) { const x = run.at(ms); assert.ok(Number.isFinite(x)); peak = Math.max(peak, x); }
  assert.ok(peak < 1.03, `the commit spring carries on without a visible wobble (peak ${peak.toFixed(3)})`);
  assert.equal(run.at(run.total), 1, 'the next clip lands exactly');
  assert.ok(run.total < 900, 'a clip change takes under a second');
  const peek = gesture.swipeMotion(0.16, 420, false);
  let high = 0, low = 1;
  for (let ms = 0; ms <= peek.total; ms += 4) { const x = peek.at(ms); high = Math.max(high, x); low = Math.min(low, x); }
  assert.ok(high <= 0.1601 && low > -0.005, 'a peek never goes past its drag and returns without overshoot');
  assert.equal(peek.at(peek.total), 0, 'a peek returns to the same clip');
  assert.ok(Math.abs((gesture.flick(1) - gesture.flick(0.999)) / 0.001 - gesture.FLICK_RELEASE) < 0.01, 'release speed constant matches the flick curve');
}

// ---- original Shorts clips draw at phone size and carry reactions on cue
{
  const code = [await compile('fun/util.ts'), await compile('fun/draw.ts'), await compile('fun/shorts-clips.ts')].join('\n');
  const stubs = 'const canvasText = (s) => s; const canvasLines = (_c, s) => [s];';
  const { SHORT_CLIPS } = await load(stubs + code, 'SHORT_CLIPS');
  assert.ok(SHORT_CLIPS.length >= 8, 'Shorts has its own set of original clips');
  const calls = { fill: 0 };
  const gradient = { addColorStop() {} };
  const ctx = new Proxy({}, { get(t, k) {
    if (k in t) return t[k];
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => gradient;
    if (k === 'measureText') return (s) => ({ width: String(s).length * 5 });
    if (k === 'fill' || k === 'fillRect') return (...a) => { for (const n of a) assert.ok(Number.isFinite(n), 'shapes have finite geometry'); calls.fill++; };
    return () => {};
  }, set(t, k, v) { t[k] = v; return true; } });
  const ids = new Set();
  const REAL = /youtube|tiktok|instagram|mrbeast|theo|primeagen|fireship|fridman|two minute/i;
  for (const clip of SHORT_CLIPS) {
    assert.ok(!ids.has(clip.id), `unique clip id ${clip.id}`); ids.add(clip.id);
    assert.ok(clip.post.user && clip.post.caption && clip.title, `${clip.id} has a handle and caption`);
    assert.ok(!REAL.test(`${clip.title} ${clip.channel} ${clip.post.user} ${clip.post.caption}`), `${clip.id} names no real platform or creator`);
    assert.ok(clip.beats.length > 0, `${clip.id} has a moment to react to`);
    for (const b of clip.beats) {
      assert.ok(b.at > 0.3 && b.at < clip.loop - 0.3, `${clip.id} reacts inside the clip`);
      assert.ok(['laugh', 'flinch', 'show'].includes(b.react));
    }
    for (let t = 0; t <= clip.loop; t += 0.05) clip.draw(ctx, 134, 284, t);
  }
  assert.ok(calls.fill > 1000, 'every clip paints');
  const kinds = new Set(SHORT_CLIPS.flatMap((c) => c.beats.map((b) => b.react)));
  assert.deepEqual([...kinds].sort(), ['flinch', 'laugh', 'show'], 'the feed has laughs, scares and clips worth showing a friend');
}

// ---- the phone yields to work at once
{
  const code = await compile('os/idle.ts');
  const delayed = [], sounds = [];
  const fake = () => fake;
  const stub = new Proxy(fake, { get: (_t, k) => (k === Symbol.toPrimitive ? () => NaN : stub), apply: () => stub, construct: () => stub });
  const used = { usePhone: 0 };
  const known = {
    gsap: { delayedCall: (_s, fn) => delayed.push(fn), to() {}, fromTo() {} },
    gameSound: { at: (cue, el, gain) => sounds.push({ cue, el, gain }) },
    usePhone: async () => { used.usePhone++; },
    preloadActivity: () => {},
    PHONE_APP_DOING: {},
    Cancelled: class Cancelled extends Error {},
  };
  const scope = new Proxy(known, { has: (t, k) => k in t || !(k in globalThis), get: (t, k) => (k === Symbol.unscopables ? undefined : k in t ? t[k] : k in globalThis ? globalThis[k] : stub) });
  const IdleLife = new Function('scope', `with (scope) { ${code}\n return IdleLife; }`)(scope);
  const robotWith = (pickUp) => ({ calls: [], reactions: [], el: { robot: true }, currentPose: 'phone',
    holdPhone(on) { this.calls.push(on); return on ? pickUp : Promise.resolve(); },
    react(kind) { this.reactions.push(kind); }, phoneReact(kind, side) { this.reactions.push(side ? `${kind}:${side}` : kind); },
    wake() {}, setPose() {} });
  const wm = { epoch: 0, isOpen: () => false, close() {}, sleep: async () => {} };
  const stage = (neighbor) => ({ sleepy() {}, say() {}, phoneScreen: { innerHTML: '' }, neighbor: () => neighbor });

  // new work arrives in the middle of the reach for the phone
  let finishPickUp;
  const robot = robotWith(new Promise((r) => { finishPickUp = r; }));
  const life = new IdleLife(wm, robot, stage(null));
  life.active = true;
  const tok = ++life.token;
  const run = life.doActivity('phone', tok).catch((e) => e);
  await Promise.resolve();
  assert.deepEqual(robot.calls, [true], 'the robot reaches for its phone');
  assert.equal(life.holdingPhone, true, 'the phone counts as in hand from the first reach');
  life.halt();
  assert.deepEqual(robot.calls, [true, false], 'work sends the phone straight back, even mid-reach');
  assert.equal(life.holdingPhone, false);
  finishPickUp();
  assert.ok((await run) instanceof known.Cancelled, 'the phone session ends with the work');
  assert.equal(used.usePhone, 0, 'no app opens on a phone that is already going back');

  // stop() (another thread or a reset) also puts it away immediately
  const robot2 = robotWith(Promise.resolve());
  const life2 = new IdleLife(wm, robot2, stage(null));
  life2.active = true; life2.phoneUp = true;
  life2.stop();
  assert.deepEqual(robot2.calls, [false]);

  // reactions: show needs a free neighbour, otherwise it is a laugh; foley comes from the robot
  const neighbour = robotWith(Promise.resolve());
  neighbour.currentPose = 'rest';
  const life3 = new IdleLife(wm, robot2, stage({ side: 1, robot: neighbour }));
  life3.active = true; life3.phoneUp = true;
  const host = life3.host(life3.token);
  host.phoneReact('show');
  assert.deepEqual(robot2.reactions, ['show:1'], 'the robot holds the phone out toward its neighbour');
  assert.equal(sounds.at(-1).cue, 'chatter'); assert.equal(sounds.at(-1).el, robot2.el);
  delayed.splice(0).forEach((fn) => fn());
  assert.deepEqual(neighbour.reactions, ['laugh'], 'the neighbour laughs at what it is shown');
  const life4 = new IdleLife(wm, robot2, stage(null));
  life4.active = true; life4.phoneUp = true;
  robot2.reactions.length = 0;
  life4.host(life4.token).phoneReact('show');
  assert.deepEqual(robot2.reactions, ['laugh'], 'without anyone to show, it just laughs');
  assert.equal(sounds.at(-1).cue, 'giggle');
  const stale = life4.host(life4.token);
  life4.halt();
  robot2.reactions.length = 0;
  stale.phoneReact('flinch');
  assert.deepEqual(robot2.reactions, [], 'no phone reactions once work has arrived');
}

// ---- accessories stay in front of the held phone
{
  const css = await src('office/office.css');
  const z = (sel) => Number(new RegExp(`\\n${sel.replace('.', '\\.')} \\{[^}]*z-index: (\\d+)`).exec(css)?.[1]);
  assert.ok(z('.robot-host') > z('.phone-held'), 'the robot (hat, headphones, accessories) draws over the held phone in every pose');
  const world = await src('world/world.css');
  assert.ok(Number(/\.world-thumb \{[^}]*z-index: (\d+)/.exec(world)?.[1]) > z('.robot-host'), 'only the thumb sits on top of the phone screen');
}

console.log('PASS: thumb gesture, original Shorts clips with cued reactions, phone yields to work, neighbour show, accessory layering');
