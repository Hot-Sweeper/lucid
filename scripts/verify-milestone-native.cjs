// Real milestone bursts in the candidate app, with isolated settings and read-only fixture data.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
if (!process.versions.electron) {
  const env = { ...process.env, LUCID_MS_OUT: path.resolve(process.argv[2]), LUCID_MS_BUILD: path.resolve(process.argv[3] || 'dist-build') }; delete env.ELECTRON_RUN_AS_NODE;
  require('node:child_process').spawn(require('electron'), ['--ozone-platform=x11', __filename, ...process.argv.slice(2)], { env, stdio: 'inherit' }).on('exit', code => process.exit(code ?? 1));
} else {
  const { app } = require('electron');
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
  const out = process.env.LUCID_MS_OUT, build = process.env.LUCID_MS_BUILD;
  fs.mkdirSync(path.join(out, 'profile'), { recursive: true });
  app.setPath('userData', path.join(out, 'profile')); app.setPath('temp', out);
  Object.assign(process.env, { LUCID_SHOT: out, LUCID_SHOT_PROFILE: app.getPath('userData'), LUCID_SHOT_EVERY: '600000', LUCID_DEV_URL: require('node:url').pathToFileURL(path.join(build, 'index.html')).href });
  fs.writeFileSync(path.join(out, 'profile', 'settings.json'), JSON.stringify({ milestones: [], orch: { auto: false, review: false, paused: true } }));
  const data = { projects: [], threads: [], shipped: { total: 1000, today: 100 } };
  const totals = { tokens: 0, costUsd: 0, byHarness: {}, byModel: {}, byProject: {} };
  Object.assign(require('../electron/t3.cjs'), { world: () => structuredClone(data), officeTasks: () => [], watchThread: () => () => {}, pendingRequests: () => [], resolvedRequestsSince: () => [], userMessagesSince: () => [], itemsSince: () => [], listProjects: () => [], listThreads: () => [], coinBindings: () => [] });
  Object.assign(require('../electron/t3server.cjs'), { status: async () => ({ paired: true }), usageLimits: async () => ({ providers: [] }), dispatch: async () => { throw Error('External writes forbidden in milestone fixture'); } });
  Object.assign(require('../electron/usage.cjs'), { getUsage: async () => ({ updatedAt: new Date().toISOString(), windows: { today: totals, week: totals, last5h: totals }, limits: {}, errors: [] }), getCoinSources: async () => ({ sources: [], usage: {} }) });
  Object.assign(require('../electron/environments.cjs'), { getEnvironments: async () => ({ localId: 'fixture', buildings: [{ id: 'fixture', label: 'Milestone fixture', local: true }] }) });
  Object.assign(require('../electron/weather.cjs'), { getWeather: async () => null, lastError: () => null });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  let win;
  app.on('browser-window-created', (_e, window) => {
    if (win) return; win = window;
    win.webContents.once('did-finish-load', async () => {
      try {
        win.setFocusable(true); win.unmaximize(); win.setPosition(0, 0); win.setMinimumSize(320,480); win.setContentSize(1280,800); win.show(); win.focus();
        const samples = [], titles = new Set(); let captured = false;
        const ev = code => win.webContents.executeJavaScript(code);
        for (let i = 0; i < 220; i++) {
          const row = await ev(`(()=>{const es=[...document.querySelectorAll('.milestone-toast')];return {count:es.length,toasts:es.map(e=>{const r=e.getBoundingClientRect(),copy=e.querySelector('.milestone-copy'),d=e.querySelector('.milestone-detail'),b=e.querySelector('.milestone-badge'),dr=d.getBoundingClientRect();return {title:copy.querySelector('b').textContent,detail:d.textContent,badge:b.textContent,left:r.left,right:r.right,width:innerWidth,inside:dr.left>=r.left&&dr.right<=r.right&&dr.top>=r.top&&dr.bottom<=r.bottom,overflow:copy.scrollWidth>copy.clientWidth}})}})()`);
          assert(row.count <= 1, 'Concurrent milestone toasts');
          for (const t of row.toasts) { if (t.title !== 'Daily reward') assert.equal(t.badge, '★'); assert(t.detail.length > 0 && t.inside && !t.overflow); assert(t.left>=0 && t.right<=t.width); titles.add(t.title); }
          samples.push(row);
          if (row.count && !captured && i > 35) { fs.writeFileSync(path.join(out,'milestone-after.png'),(await win.webContents.capturePage()).toPNG()); const r=await ev(`(()=>{const r=document.querySelector('.milestone-toast').getBoundingClientRect();return {x:Math.max(0,Math.floor(r.x)-20),y:Math.max(0,Math.floor(r.y)-12),width:Math.ceil(r.width)+40,height:Math.ceil(r.height)+24}})()`); fs.writeFileSync(path.join(out,'milestone-detail.png'),(await win.webContents.capturePage(r)).toPNG()); captured=true; }
          if (titles.size>=3 && i===80) { win.unmaximize(); win.setContentSize(360,640); }
          if (i===95) fs.writeFileSync(path.join(out,'milestone-narrow.png'),(await win.webContents.capturePage()).toPNG());
          await wait(150);
        }
        assert(samples.some(s=>s.toasts.some(t=>t.width<=380)), 'Narrow viewport was exercised');
        assert(titles.size>=6, 'Burst did not advance through queued milestones');
        fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({titles:[...titles],samples},null,2));
        console.log('PASS: sequential milestone burst, correct badge/detail, bounded copy at desktop and narrow widths.'); app.exit(0);
      } catch (e) { console.error(e); app.exit(1); }
    });
  });
  require('../electron/main.cjs');
}
