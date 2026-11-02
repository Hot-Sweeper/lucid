// Bounded native acceptance for the robots' sheet player. Builds the actual production Desk,
// Director, ToolApp, player and shared screen clock into private bundles twice: once from the
// baseline revision (before) and once from this checkout (after). Real retained sheets from robot
// sessions are played through the real Director "Read an image" path in an offscreen Electron
// window with its own profile. It never connects to T3 and never touches the installed app.
//   node scripts/verify-sheet-player-native.cjs <output-directory> [baseline-revision]
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const INPUTS = path.join(root, 'docs/evidence/sheet-player-20261102/inputs');
// Real sheets robots looked at, with the frame layout a person reads off each one.
const SHEETS = {
  'tradebot-timeline-sheet.png': { cols: 4, rows: 6, frames: 24, first: { x: 2, y: 2, w: 410, h: 229 }, clips: 1 },
  'directory-sheet.png': { cols: 4, rows: 3, frames: 12, first: { x: 2, y: 2, w: 410, h: 229 }, clips: 1 },
  'four-in-a-row-sheet.png': { cols: 3, rows: 2, frames: 6, first: { x: 0, y: 0, w: 330, h: 294 }, clips: 1 },
  'beatlab-sheet.png': { cols: 2, rows: 3, frames: 6, first: { x: 9, y: 0, w: 1038, h: 510 }, clips: 1 },
  'meme-review-sheet.png': { cols: 5, rows: 7, frames: 35, first: { x: 108, y: 20, w: 240, h: 180 }, clips: 7 },
};

function sourceTree(out, revision) {
  // The baseline is the exact committed source of `revision`, extracted read-only.
  const dir = path.join(out, 'baseline-source');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const tar = path.join(dir, 'baseline.tar');
  execFileSync('git', ['-C', root, 'archive', '--format=tar', '-o', tar, revision, 'src', 'scripts', 'electron'], { windowsHide: true });
  // relative names: some tar builds read "E:" in a path as a remote host
  execFileSync('tar', ['-xf', 'baseline.tar'], { cwd: dir, windowsHide: true });
  fs.rmSync(tar);
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'junction');
  return dir;
}

async function prepare(out, label, srcRoot) {
  const generated = path.join(out, `fixture-${label}`);
  fs.mkdirSync(generated, { recursive: true });
  const sourceHashes = {};
  const importPath = name => JSON.stringify(path.join(srcRoot, name).replaceAll('\\', '/'));
  const entry = path.join(generated, 'entry.ts');
  fs.writeFileSync(entry, `
import ${importPath('node_modules/@fontsource-variable/lexend/index.css')};
import ${importPath('node_modules/@fontsource-variable/jetbrains-mono/index.css')};
import ${importPath('src/styles.css')};
import ${importPath('src/office/office.css')};
import ${importPath('src/world/world.css')};
import { useRobot, Desk } from ${importPath('src/office/desk.ts')};
import { TopDownRobot } from ${importPath('src/world/seated.ts')};
import { detectSheet } from ${importPath('src/os/sheet.ts')};
import { setRenderView } from ${importPath('src/perf/render.ts')};
// Every draw onto any canvas is counted with its time, per canvas.
const drawLog = new WeakMap<HTMLCanvasElement, number[]>();
const original = CanvasRenderingContext2D.prototype.drawImage;
CanvasRenderingContext2D.prototype.drawImage = function (this: CanvasRenderingContext2D, ...args: any[]) {
  const list = drawLog.get(this.canvas) ?? []; list.push(performance.now()); drawLog.set(this.canvas, list);
  return (original as any).apply(this, args);
} as any;
useRobot((host, rig) => new TopDownRobot(host, rig));
const floor = document.getElementById('floor')!;
let desk: any = null, frameTimes: { t: number; n: number }[] = [], heldTimes: number[] = [], observers: MutationObserver[] = [];
const profile = { id: 'bot-review', name: 'Pip', brand: 'claude', provider: 'claudeAgent', look: {}, hiredAt: Date.now(), threadId: 't-review', jobs: 1,
  prefs: { editor: 'studio', wallpaper: 2, games: { snake: 1, flappy: 1, dash: 1, chess: 1 }, phone: 'clips', subagents: 'app', music: 0, social: 0, mug: '#4fb6ff', tasks: 'sticky', hobby: 'chiller', windows: 'floating', listens: 'never', launch: 'dock', switching: 'click', tidiness: 'normal', git: 'cli' } } as any;
const player = () => desk?.wm.wins.get('player');
const stage = () => player()?.body.querySelector('canvas') as HTMLCanvasElement | null;
(window as any).sheetFixture = {
  async detect(name: string, data: string) {
    const f = await detectSheet(data, name);
    const s: any = f?.sheet;
    if (!s) return null;
    return Array.isArray(s.frames) ? { cols: s.cols, rows: s.rows, frames: s.frames.length, first: s.frames[0], rects: s.frames, clips: s.clips?.length ?? 1, fps: s.fps, kind: s.kind }
      : { cols: s.cols, rows: s.rows, frames: s.frames, first: { x: 0, y: 0, w: s.fw, h: s.fh }, clips: 1, fps: s.fps, kind: 'grid' };
  },
  // A robot reads the image with the production Director: the item a Read tool call produces.
  start(name: string, data: string) {
    this.destroy();
    frameTimes = []; heldTimes = [];
    desk = new Desk(floor, 0, 0, { peek: async () => null, image: async (p: string) => (p.endsWith(name) ? data : null), readText: async () => null } as any);
    desk.assign({ id: 't-review', title: 'Review the captured frames', provider: 'claudeAgent' }, profile);
    desk.director.setInfo({ id: 't-review', title: 'Review the captured frames', provider: 'claudeAgent', root: '', run: { id: 'r1', status: 'running' } });
    setRenderView(desk.screen, true, 1640, 820);
    const file = 'C:/review/captures/' + name;
    desk.director.push([{ id: 'read-1', runId: 'r1', ordinal: 1, type: 'dynamic_tool', status: 'completed', updatedAt: new Date().toISOString(),
      data: { toolName: 'Read', input: { file_path: file }, output: { type: 'image' }, viewedImagePath: file } }], false);
  },
  watch() {
    // frame changes and scrub holds, with their times, as the player reports them in its DOM
    const root = player()?.body.firstElementChild as HTMLElement | undefined;
    if (!root) return false;
    const mo = new MutationObserver(() => { if (root.dataset.frame != null) frameTimes.push({ t: performance.now(), n: Number(root.dataset.frame) }); });
    mo.observe(root, { attributes: true, attributeFilter: ['data-frame'] });
    const knob = root.querySelector('.vp-knob');
    if (knob) { const ko = new MutationObserver(() => { if (knob.classList.contains('held')) heldTimes.push(performance.now()); else heldTimes.push(-performance.now()); }); ko.observe(knob, { attributes: true, attributeFilter: ['class'] }); observers.push(ko); }
    observers.push(mo);
    return true;
  },
  state() {
    const w = player(), c = stage(), root = w?.body.firstElementChild as HTMLElement | undefined;
    return { open: !!w, title: w?.title.textContent ?? null, cls: root?.className ?? null, frame: root?.dataset.frame ?? null, num: w?.body.querySelector('.vp-num, .sh-time')?.textContent ?? null,
      playing: !!w?.body.querySelector('.vp-stage.playing') || w?.body.querySelector('.sh-play')?.getAttribute('aria-label') === 'Pause',
      held: !!w?.body.querySelector('.vp-knob.held'), connected: !!c?.isConnected, draws: c ? (drawLog.get(c) ?? []).length : 0, now: performance.now(),
      queue: desk ? desk.director.queue.length : 0, pump: desk ? desk.director.pumpEpoch : null };
  },
  draws() { const c = stage(); return c ? [...(drawLog.get(c) ?? [])] : []; },
  frames() { return frameTimes.slice(); },
  holds() { return heldTimes.slice(); },
  // the stage pixels against the same frame cut straight out of the source sheet
  cropError(rect: { x: number; y: number; w: number; h: number }) {
    const c = stage(); if (!c) return null;
    const img = new Image(); img.src = (window as any).__sheetData;
    return new Promise((ok) => { img.onload = () => {
      const t = document.createElement('canvas'); t.width = c.width; t.height = c.height;
      const g = t.getContext('2d')!; g.drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, t.width, t.height);
      const a = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data, b = g.getImageData(0, 0, t.width, t.height).data;
      let s = 0; for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      ok(s / (a.length / 4) / 3);
    }; });
  },
  // a drawn sprite strip (8 poses) and a picture with a repeating pattern that is not a sheet
  synthetic() {
    const strip = document.createElement('canvas'); strip.width = 768; strip.height = 96;
    const g = strip.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, 768, 96);
    for (let n = 0; n < 8; n++) { const t = n / 8, x = n * 96 + 48, y = 58 + Math.sin(t * 6.283) * 5;
      g.fillStyle = '#6e7bd8'; g.fillRect(x - 16, y - 6, 32, 30); g.fillStyle = '#f2e8d8'; g.fillRect(x - 18, y - 34, 36, 28);
      g.fillStyle = '#1c2150'; g.fillRect(x - 12, y - 27, 24, 12); g.fillStyle = '#f2e8d8'; g.fillRect(x + 16, y - 4 + Math.sin(t * 6.283 + 1) * 10, 12, 6); }
    const pic = document.createElement('canvas'); pic.width = 900; pic.height = 260;
    const p = pic.getContext('2d')!, sky = p.createLinearGradient(0, 0, 900, 260);
    sky.addColorStop(0, '#f9a86b'); sky.addColorStop(0.5, '#6aa7d8'); sky.addColorStop(1, '#264a7a'); p.fillStyle = sky; p.fillRect(0, 0, 900, 260);
    for (let i = 0; i < 40; i++) { p.fillStyle = 'hsl(' + (200 + i * 3) + ' 40% ' + (25 + (i % 5) * 6) + '%)'; p.beginPath(); p.moveTo(i * 24 - 30, 260); p.lineTo(i * 24 + 20, 120 + ((i * 37) % 80)); p.lineTo(i * 24 + 70, 260); p.fill(); }
    // the exact transparent walk cycle the screen details check draws
    const a = document.createElement('canvas'); a.width = 768; a.height = 96; const q = a.getContext('2d')!;
    for (let i = 0; i < 8; i++) { const x = i * 96; q.fillStyle = '#f2e8d8'; q.beginPath(); q.roundRect(x + 30, 14, 36, 28, 10); q.fill(); q.fillStyle = '#1c2150'; q.fillRect(x + 36, 23, 24, 10); q.fillStyle = '#6e7bd8'; q.fillRect(x + 32, 44, 32, 30); q.strokeStyle = '#f2e8d8'; q.lineWidth = 6; q.lineCap = 'round'; q.beginPath(); q.moveTo(x + 63, 48); q.lineTo(x + 76, 38 + Math.sin(i / 8 * Math.PI * 2) * 8); q.stroke(); }
    return { strip: strip.toDataURL(), pic: pic.toDataURL(), walk: a.toDataURL() };
  },
  suspend(on: boolean) { if (desk) setRenderView(desk.screen, !on, on ? 0 : 1640, 820); },
  destroy() { for (const o of observers) o.disconnect(); observers = []; if (desk) { desk.destroy(); } desk = null; },
  stageAlive(c?: HTMLCanvasElement) { return c?.isConnected ?? false; },
};
`);
  const { build } = await import(pathToFileURL(path.join(root, 'node_modules/vite/dist/node/index.js')).href);
  const srcPrefix = srcRoot.replaceAll('\\', '/') + '/src/';
  await build({
    configFile: false, root: generated, base: './', logLevel: 'error',
    plugins: [{ name: 'record-tested-source', transform(_code, id) {
      const file = id.split('?')[0];
      if (file.startsWith(srcPrefix) && fs.existsSync(file)) sourceHashes['src/' + file.slice(srcPrefix.length)] = sha(fs.readFileSync(file));
    } }],
    build: { outDir: path.join(generated, 'assets'), emptyOutDir: true,
      lib: { entry, name: 'SheetPlayerReview', formats: ['iife'], fileName: () => 'sheet-review.js', cssFileName: 'sheet-review' },
      rollupOptions: { output: { inlineDynamicImports: true } } },
  });
  for (const [name, hash] of Object.entries(sourceHashes)) assert.equal(sha(fs.readFileSync(path.join(srcRoot, name))), hash, `Source changed during fixture build: ${name}`);
  fs.writeFileSync(path.join(generated, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><title>Isolated sheet player review</title><link rel="stylesheet" href="./assets/sheet-review.css"><style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#141a33}
#floor{position:relative;width:400px;height:380px;transform:scale(2.3);transform-origin:top left;background:#c49a6c}
</style></head><body><div id="floor"></div><script src="./assets/sheet-review.js"></script></body></html>`);
  return { sources: sourceHashes, bundleSha256: sha(fs.readFileSync(path.join(generated, 'assets/sheet-review.js'))) };
}

async function native(out) {
  const { app, BrowserWindow, session } = require('electron');
  app.setPath('userData', path.join(out, 'profile'));
  app.on('window-all-closed', () => {});   // one window per build, one after the other
  const tested = JSON.parse(fs.readFileSync(path.join(out, 'tested-source.json')));
  const result = { at: new Date().toISOString(), fixture: true, productionTouched: false, baseline: tested.baseline, checks: [], captures: [], detections: {}, errors: [], networkAttempts: [], executing: {} };
  const deadline = setTimeout(() => { result.status = 'timeout'; fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(result, null, 2)); app.exit(2); }, 420000);
  let win;
  const check = (name, ok, detail) => { result.checks.push({ name, ok: !!ok, detail }); assert(ok, name + ': ' + JSON.stringify(detail)); };
  try {
    await app.whenReady();
    session.defaultSession.webRequest.onBeforeRequest((request, done) => {
      const remote = !/^(file:|data:|devtools:|blob:)/.test(request.url);
      if (remote) result.networkAttempts.push(request.url);
      done({ cancel: remote });
    });
    const data = Object.fromEntries(Object.keys(SHEETS).map(name => [name, 'data:image/png;base64,' + fs.readFileSync(path.join(INPUTS, name)).toString('base64')]));
    for (const label of ['before', 'after']) {
      win = new BrowserWindow({ width: 920, height: 874, show: false, webPreferences: { contextIsolation: true, sandbox: true, offscreen: true, backgroundThrottling: false } });
      const wc = win.webContents;
      const ev = code => wc.executeJavaScript(code, true);
      wc.on('render-process-gone', (_event, details) => result.errors.push({ label, details }));
      wc.on('console-message', (_event, details) => { if (details?.level === 'error') result.errors.push({ label, message: details.message }); });
      const capture = async name => {
        await wait(160);
        const file = path.join(out, `${label}-${name}.png`);
        const bytes = (await wc.capturePage()).toPNG();
        fs.writeFileSync(file, bytes);
        result.captures.push({ label, name, file: path.basename(file), sha256: sha(bytes), size: bytes.length });
      };
      const state = () => ev('window.sheetFixture.state()');
      const until = async (test, ms, what) => { const t = Date.now(); for (;;) { const s = await state(); if (test(s)) return s; if (Date.now() - t > ms) throw new Error(`${label}: timed out waiting for ${what}: ${JSON.stringify(s)}`); await wait(60); } };
      await win.loadFile(path.join(out, `fixture-${label}/index.html`));
      await ev('document.fonts.ready.then(()=>true)');
      // the executing bytes are the tested bundle
      const scripts = [];
      wc.debugger.attach('1.3');
      wc.debugger.on('message', (_e, method, params) => { if (method === 'Debugger.scriptParsed') scripts.push(params); });
      await wc.debugger.sendCommand('Debugger.enable');
      const script = scripts.find(item => item.url.endsWith('/assets/sheet-review.js'));
      assert(script, 'Executing fixture bundle is visible in V8');
      const { scriptSource } = await wc.debugger.sendCommand('Debugger.getScriptSource', { scriptId: script.scriptId });
      result.executing[label] = sha(scriptSource);
      check(`${label}: executing V8 bytes match the tested bundle`, result.executing[label] === tested[label].bundleSha256);
      await wc.debugger.sendCommand('Debugger.disable');

      // 1. frame bounds of every real sheet
      result.detections[label] = {};
      for (const [name, want] of Object.entries(SHEETS)) {
        await ev(`window.__sheetData=${JSON.stringify(data[name])};void 0`);
        const got = await ev(`window.sheetFixture.detect(${JSON.stringify(name)}, window.__sheetData)`);
        result.detections[label][name] = got;
        if (label === 'after') check(`after: ${name} frames ${want.cols} x ${want.rows} with exact first frame and ${want.clips} clip(s)`,
          got && got.cols === want.cols && got.rows === want.rows && got.frames === want.frames && got.clips === want.clips
          && Math.abs(got.first.x - want.first.x) <= 1 && Math.abs(got.first.y - want.first.y) <= 1 && Math.abs(got.first.w - want.first.w) <= 2 && Math.abs(got.first.h - want.first.h) <= 2, got);
      }

      if (label === 'after') {
        const syn = await ev('window.sheetFixture.synthetic()');
        const sprite = await ev(`window.sheetFixture.detect('walk-sheet.png', ${JSON.stringify(syn.strip)})`);
        check('after: a drawn sprite strip is 8 poses at sprite speed', sprite && sprite.frames === 8 && sprite.kind === 'sprite' && sprite.fps === 10, sprite);
        const walk = await ev(`window.sheetFixture.detect('fixture-walk-cycle-sheet.png', ${JSON.stringify(syn.walk)})`);
        check('after: the screen details walk cycle fixture is 8 poses', walk && walk.frames === 8 && walk.cols === 8, walk);
        const picture = await ev(`window.sheetFixture.detect('skyline.png', ${JSON.stringify(syn.pic)})`);
        check('after: a wide picture with a repeating pattern stays a picture', picture === null, picture);
      }

      // 2. the production Director path, with the timeline sheet (screenshots, 24 frames)
      const trade = 'tradebot-timeline-sheet.png';
      await ev(`window.__sheetData=${JSON.stringify(data[trade])};window.sheetFixture.start(${JSON.stringify(trade)}, window.__sheetData);void 0`);
      const opened = await until(s => s.open, 25000, 'the player window').catch(async e => { await capture('no-player'); if (label === 'before') return null; throw e; });
      if (label === 'before') {
        // the baseline: whatever the previous version shows for the same real sheet
        await wait(2600); await capture('tradebot-playing');
        await wait(4200); await capture('tradebot-later');
        const s = await state();
        result.baselineState = s;
        await ev('window.sheetFixture.start(' + JSON.stringify('meme-review-sheet.png') + ',' + JSON.stringify(data['meme-review-sheet.png']) + ');void 0');
        await wait(5200); await capture('meme-review');
        await ev('window.sheetFixture.destroy();void 0');
        win.destroy(); win = null;
        continue;
      }
      check('after: Director opens the real sheet in Player with its file name', opened.title === trade, opened);
      await until(s => s.playing, 20000, 'playback');
      check('after: watching frame changes', await ev('window.sheetFixture.watch()'));
      const s0 = await state();
      check('after: player counts the real 24 frames', /of 24/.test(s0.num || ''), s0);
      await wait(2400);
      await capture('tradebot-playing');
      // draws happen only on a frame change and during the short dissolve after it
      const draws = await ev('window.sheetFixture.draws()'), frames = await ev('window.sheetFixture.frames()');
      const windowStart = s0.now, windowDraws = draws.filter(t => t > windowStart + 50), changes = frames.filter(f => f.t > windowStart);
      const outside = windowDraws.filter(t => !frames.some(f => t >= f.t - 20 && t <= f.t + 150));
      check('after: playback draws only at frame changes and their dissolve', changes.length >= 3 && windowDraws.length > 0 && outside.length === 0 && windowDraws.length <= changes.length * 10 + 2,
        { frameChanges: changes.length, draws: windowDraws.length, outsideTransitions: outside.length, seconds: 2.4 });
      // suspended screen: no draws, logical playback keeps time
      const before = await state();
      await ev('window.sheetFixture.suspend(true);void 0');
      await wait(250);
      const suspendedFrom = await state();
      await wait(1400);
      const suspendedTo = await state();
      check('after: a suspended screen draws nothing and shows no frame changes', suspendedTo.draws === suspendedFrom.draws && suspendedTo.frame === suspendedFrom.frame,
        { from: suspendedFrom.draws, to: suspendedTo.draws, frame: [suspendedFrom.frame, suspendedTo.frame] });
      await ev('window.sheetFixture.suspend(false);void 0');
      const resumed = await until(s => s.draws > suspendedTo.draws, 1500, 'drawing to resume');
      check('after: resumed playback samples the real clock instead of replaying missed frames', resumed.draws - suspendedTo.draws <= 12 && resumed.frame !== before.frame,
        { resumedDraws: resumed.draws - suspendedTo.draws, before: before.frame, after: resumed.frame });
      // scrubbing: the robot drags along the bar and the picture follows
      await until(s => s.held, 30000, 'the scrub');
      await capture('tradebot-scrubbing');
      const scrubEnd = await until(s => !s.held, 8000, 'the scrub to end');
      const holds = await ev('window.sheetFixture.holds()'), allFrames = await ev('window.sheetFixture.frames()');
      const held = holds.find(t => t > 0), released = holds.find(t => t < 0 && -t > held);
      const scrubbed = allFrames.filter(f => f.t >= held && f.t <= -released).map(f => f.n);
      check('after: scrubbing moves forward through real frames', scrubbed.length >= 3 && scrubbed.every((n, i) => i === 0 || n >= scrubbed[i - 1]) && new Set(scrubbed).size >= 3, { scrubbed, frame: scrubEnd.frame });
      // the robot finishes: the Director goes back to idle work, the player stops drawing
      await until(s => s.pump === -1 && s.queue === 0, 20000, 'the Director to finish');
      const finished = await state();
      await wait(800);
      const idle = await state();
      check('after: a finished player draws nothing more', idle.draws === finished.draws, { finished: finished.draws, idle: idle.draws });
      // the stage shows exactly the detected crop of the frame it stopped on
      const det = result.detections.after[trade];
      const fr = Number(idle.frame), crop = det.rects[fr];
      const err = await ev(`window.sheetFixture.cropError(${JSON.stringify(crop)})`);
      check('after: the stage shows the frame cropped at its real bounds', err !== null && err < 6, { frame: fr, crop, meanError: err });
      const shifted = await ev(`window.sheetFixture.cropError(${JSON.stringify({ ...crop, y: crop.y + 118 })})`);
      check('after: a crop off by half a frame is clearly different (the check can fail)', shifted > err * 3 + 4, { shifted, exact: err });
      // clips: the meme review plays row by row
      await ev('window.sheetFixture.start(' + JSON.stringify('meme-review-sheet.png') + ',' + JSON.stringify(data['meme-review-sheet.png']) + ');void 0');
      await until(s => s.playing, 20000, 'meme playback');
      await wait(2800);
      const meme = await state();
      check('after: the meme review plays as clips of real rows', /Clip \d+ of 7, frame \d of 5/.test(meme.num || ''), meme);
      await capture('meme-review');
      // destroyed mid-play: the loop stops, nothing draws into a removed screen
      await ev('window.__stage=document.querySelector(".app-player canvas");void 0');
      await ev('window.sheetFixture.destroy();void 0');
      const gone = await ev('({count:(window.sheetFixture.stageAlive(window.__stage)),t:performance.now()})');
      await wait(900);
      const after = await ev('(()=>{const c=window.__stage;return {connected:c.isConnected}})()');
      check('after: a destroyed screen removes the player', gone.count === false && after.connected === false, { gone, after });
      // drawing after destruction: count with a fresh log on the detached canvas
      const late = await ev(`new Promise(ok=>{const c=window.__stage,ctx=c.getContext('2d');let n=0;const o=ctx.drawImage;ctx.drawImage=function(...a){n++;return o.apply(this,a)};setTimeout(()=>ok(n),900)})`);
      check('after: playback stops drawing once its screen is destroyed', late === 0, { drawsAfterDestroy: late });
      // the four in a row sheet, paused on a frame, for the record
      await ev('window.sheetFixture.start(' + JSON.stringify('four-in-a-row-sheet.png') + ',' + JSON.stringify(data['four-in-a-row-sheet.png']) + ');void 0');
      await until(s => s.held, 30000, 'the four in a row scrub');
      await capture('four-in-a-row-scrubbing');
      await ev('window.sheetFixture.destroy();void 0');
      win.destroy(); win = null;
    }
    check('No external network or fixture renderer failures', result.networkAttempts.length === 0 && result.errors.length === 0, { network: result.networkAttempts, errors: result.errors });
    result.status = 'passed';
    console.log(`Sheet player native review passed: ${result.checks.length} checks and ${result.captures.length} screenshots. Results: ${path.join(out, 'results.json')}`);
  } catch (error) {
    result.status = 'failed'; result.error = error.stack;
    if (win && !win.isDestroyed()) fs.writeFileSync(path.join(out, 'failure.png'), (await win.webContents.capturePage()).toPNG());
    throw error;
  } finally {
    clearTimeout(deadline);
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(result, null, 2));
    if (win && !win.isDestroyed()) win.destroy();
  }
}

const out = path.resolve(process.argv[2] || 'E:/Lucid-validation/sheet-player-native-20261102');
const baseline = process.argv[3] || 'origin/main';
if (process.versions.electron) native(out).then(() => require('electron').app.exit(0), error => { console.error(error); require('electron').app.exit(1); });
else (async () => {
  fs.mkdirSync(out, { recursive: true });
  const revision = execFileSync('git', ['-C', root, 'rev-parse', baseline], { encoding: 'utf8' }).trim();
  const beforeSrc = sourceTree(out, revision);
  const before = await prepare(out, 'before', beforeSrc);
  const after = await prepare(out, 'after', root);
  after.sources['scripts/verify-sheet-player-native.cjs'] = sha(fs.readFileSync(__filename));
  const inputs = Object.fromEntries(Object.keys(SHEETS).map(name => [name, sha(fs.readFileSync(path.join(INPUTS, name)))]));
  fs.writeFileSync(path.join(out, 'tested-source.json'), JSON.stringify({ at: new Date().toISOString(), baseline: { ref: baseline, revision }, candidate: execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), before, after, inputs, isolatedProfile: path.join(out, 'profile'), productionTouched: false }, null, 2));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  for (const key of Object.keys(env)) if (key.startsWith('LUCID_')) delete env[key];
  const child = require('node:child_process').spawn(require('electron'), [__filename, out], { env, windowsHide: true, stdio: 'inherit' });
  child.once('exit', code => { process.exitCode = code ?? 1; });
  child.once('error', error => { console.error(error); process.exitCode = 1; });
})().catch(error => { console.error(error); process.exitCode = 1; });
