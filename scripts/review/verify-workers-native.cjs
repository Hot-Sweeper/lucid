// Native production fixture for workers and desks: the real Electron main process and the
// real renderer build, with T3 Code replaced by synthetic office data. T3 transport calls are
// recorded instead of sent, so no live thread, account or file outside <out> is touched.
//   node scripts/review/verify-workers-native.cjs <out> <build dir> [backend root] [baseline]
// Hiring runs through the production composer, IPC handler and launch payload; only the
// final T3 launch call is replaced. Collect runs through reports.manual and settlement.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
if (!process.versions.electron) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  require('node:child_process').spawn(require('electron'), [__filename, ...process.argv.slice(2)], { env, windowsHide: true, stdio: 'inherit' }).on('exit', code => process.exit(code ?? 1));
} else {
  const { app, BrowserWindow } = require('electron');
  const out = path.resolve(process.argv[2]), build = path.resolve(process.argv[3]);
  const root = path.resolve(process.argv[4] || path.join(__dirname, '../..')), baseline = process.argv[5] === 'baseline';
  fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
  const home = path.join(out, 'home'); fs.mkdirSync(home, { recursive: true });
  process.env.USERPROFILE = home; process.env.HOME = home;   // attachments land inside the fixture
  app.setPath('userData', path.join(out, 'profile')); fs.mkdirSync(app.getPath('userData'), { recursive: true });
  for (const s of ['disable-renderer-backgrounding', 'disable-background-timer-throttling']) app.commandLine.appendSwitch(s);
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
  process.env.LUCID_SHOT = out; process.env.LUCID_SHOT_PROFILE = app.getPath('userData');
  process.env.LUCID_SHOT_EVERY = '600000'; process.env.LUCID_SHOT_COUNT = '1000';
  process.env.LUCID_DEV_URL = require('node:url').pathToFileURL(path.join(build, 'index.html')).href;
  const stamp = new Date().toISOString(), old = new Date(Date.now() - 3 * 3600e3).toISOString();
  const icon = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#ff9f5a"/><path d="M9 22V10h4v9h7v3z" fill="#1b1f33"/></svg>').toString('base64');
  const T = (id, title, provider, model, runStatus, extra = {}) => ({ id, projectId: 'lucid', title, provider, model, updatedAt: stamp, runStatus, question: null, pinned: false, settled: false, ...extra });
  const data = {
    projects: [{ id: 'lucid', title: 'Lucid', root: out, icon, scratch: false }, { id: 'scratch', title: 'Scratch', root: out, icon: null, scratch: true }],
    threads: [
      T('w1', 'Fix the settings panel scroll position', 'codex', 'gpt-6.1-sol', 'running'),
      T('w2', 'Write tests for the hire composer', 'claudeAgent', 'claude-opus-5-5', 'running'),
      T('w3', 'Add a dark mode toggle to the shop', 'codex', 'gpt-6.1-sol', 'completed'),
      T('w4', 'Translate the break room signs', 'claudeAgent', 'claude-opus-5-5', 'completed'),
      T('m1', 'Lucid planning', 'codex', 'gpt-6.1-sol', 'idle', { pinned: true }),
      T('s-byte', 'Clean up old robot names', 'codex', 'gpt-6.1-sol', 'completed', { settled: true, updatedAt: old }),
      T('s-old', 'Update the README screenshots', 'claudeAgent', 'claude-opus-5-5', 'completed', { settled: true, updatedAt: old }),
    ],
    models: {}, prices: {}, shipped: { today: 0, total: 0 },
  };
  const look = (i, accent) => ({ accent, build: ['slim', 'regular', 'sturdy'][i % 3], head: 1, hat: ['beanie', 'cap', 'none', 'tophat', 'beret', 'none'][i], eyes: 'classic', tint: 'none', accessory: 'none', sticker: 'none', glow: null, blush: i % 2 === 0, headphones: false });
  const prefs = (i) => ({ wallpaper: i, games: { snake: .4, flappy: .8, dash: .2, chess: .6 }, phone: 'clips', subagents: 'cli', music: .4, social: .5, mug: '#ff9f5a', tasks: 'checklist', hobby: ['gamer', 'musician', 'chatter', 'watcher', 'chiller', 'gamer'][i], windows: ['tiler', 'floating', 'fullscreen'][i % 3], listens: 'sometimes', launch: 'dock', switching: 'click', tidiness: 'normal', git: 'cli', office: 'none', apps: ['doodle', 'crossword'], socials: ['botsapp', 'chirp'], socialsV: 2, t3: 'stable', chatApp: 'native', notesApp: 'notepad', leisure2: true });
  const robot = (i, id, name, provider, model, threadId, jobs, extra = {}) => ({ id, name, brand: provider === 'codex' ? 'codex' : 'claude', provider, look: look(i, ['#ff9f5a', '#4fb6ff', '#4ff0a0', '#b07cff', '#ffd27a', '#ff6f91'][i]), prefs: prefs(i), hiredAt: Date.parse(old), threadId, jobs, lastModel: model, ...extra });
  const roster = [
    robot(0, 'bot-byte', 'Byte', 'codex', 'gpt-6.1-sol', 's-byte', 7, { done: [] }),
    robot(1, 'bot-mochi', 'Mochi', 'codex', 'gpt-6.1-sol', 'w1', 3),
    robot(2, 'bot-pixel', 'Pixel', 'claudeAgent', 'claude-opus-5-5', 'w2', 4),
    robot(3, 'bot-nova', 'Nova', 'codex', 'gpt-6.1-sol', 'w3', 5),
    robot(4, 'bot-quill', 'Quill', 'claudeAgent', 'claude-opus-5-5', 'w4', 2),
    robot(5, 'bot-rivet', 'Rivet', 'codex', 'gpt-6.1-sol', 'm1', 9),
  ];
  const prof = app.getPath('userData');
  fs.writeFileSync(path.join(prof, 'roster.json'), JSON.stringify(roster));
  fs.writeFileSync(path.join(prof, 'settings.json'), JSON.stringify({
    orch: { threadId: 'orch-thread', projectId: 'orch-project', dir: out, review: true, reviewWorkflow: 1, paused: true, presence: 'sleep', seenUntil: stamp, lastSentAt: Date.now(), learned: 0, reviewed: {}, auto: false },
    homes: Object.fromEntries(['w1', 'w2', 'w3', 'w4', 'm1', 's-byte', 's-old'].map(id => [id, 'p:lucid'])),
    // Saved history like a long-used office: an old quiet thread and many empty places before the live desks.
    seats: { 'p:lucid': ['s-old', ...Array(40).fill(null), 'w1', 'w3', 'w2', 'w4', 'm1'] },
    wallet: { ledger: {}, spent: 0, owned: [], v: 2, collection: { baseline: { 'k-w3': 1.2 }, jobs: { w3: { title: 'Add a dark mode toggle to the shop', dollars: 1.2, coins: 1.56, ready: true } }, legacyEarned: 40, collected: 0 } },
    dailyLines: { date: new Date().toLocaleDateString('en-CA'), language: 'en' },
  }));
  const paper = (id, threadId, status, robotProfile, extra = {}) => ({ id, threadId, runId: 'run-' + threadId, title: data.threads.find(t => t.id === threadId).title, project: 'Lucid', root: out,
    robot: { id: robotProfile.id, name: robotProfile.name, provider: robotProfile.provider, look: robotProfile.look }, provider: robotProfile.provider, model: robotProfile.lastModel, effort: 'high', team: [], children: [],
    originalRequest: 'Add a toggle so the shop can switch between light and dark. Keep the existing palette.', initialRequest: '',
    response: 'Added a **Dark shop** toggle beside the shop title. The choice is saved and the shop artwork keeps its warm palette.\n\nChecks: `npm run verify:update` passed.',
    submittedAt: old, updatedAt: stamp, status, delivered: true, images: [], history: [], usage: { available: true, tokens: 18200, costUsd: 1.2 }, ...extra });
  const reports = path.join(prof, 'reports'); fs.mkdirSync(reports, { recursive: true });
  fs.writeFileSync(path.join(reports, 'index.json'), JSON.stringify([
    paper('paper-w3', 'w3', 'approved', roster[3], { reviewer: 'Orchestrator', verdict: { decision: 'approve', summary: 'The toggle works and keeps the palette. Approved.', visualChanged: false, checks: ['verify:update passed'] }, orchestratorId: 'orch-thread', sentAt: old }),
    paper('paper-w4', 'w4', 'submitted', roster[4], { originalRequest: 'Translate the break room signs into German.', response: 'Translated all eight signs. Two puns were adapted instead of translated literally.' }),
  ]));

  const calls = { launches: [], settles: [], dispatches: [] };
  const state = id => { const t = data.threads.find(t => t.id === id); return { run: t ? { id: 'run-' + id, status: t.runStatus } : null, pendingRuns: 0, pendingRequests: 0, pinned: !!t?.pinned, settled: !!t?.settled, settledAt: t?.settled ? stamp : null, title: t?.title }; };
  const t3 = require(path.join(root, 'electron/t3.cjs'));
  Object.assign(t3, { world: () => structuredClone(data), threadInfo: id => { const t = data.threads.find(t => t.id === id); return t ? { id, title: t.title, provider: t.provider, model: t.model, effort: 'high', root: out, queued: [], run: { id: 'run-' + id, status: t.runStatus } } : null; },
    listProjects: () => data.projects, listThreads: () => data.threads, listProjectsWithCounts: () => data.projects,
    watchThread: () => () => {}, conversation: () => [], conversationPage: () => ({ messages: [], hasMore: false, cursor: null }),
    pendingRequests: () => [], requestOutcome: () => null, repliesSince: () => ({ messages: [], exists: true, runStatus: 'idle' }), userMessagesSince: () => [], resolvedRequestsSince: () => [],
    itemsSince: () => [], recentItems: () => [], reportState: state, reportFacts: state, coinBindings: () => [] });
  const runtime = { source: 'T3 defaults', runtimeMode: 'full-access', selection: { providerInstanceId: 'codex', model: 'gpt-6.1-sol', options: { reasoningEffort: 'high' } },
    providers: [{ instanceId: 'codex', name: 'Codex', ready: true, models: [{ slug: 'gpt-6.1-sol', name: 'gpt-6.1-sol', isDefault: true, options: [{ id: 'reasoningEffort', label: 'Reasoning', type: 'select', choices: [{ id: 'low', label: 'Low', isDefault: false }, { id: 'high', label: 'High', isDefault: true }] }] }, { slug: 'gpt-6-luna', name: 'gpt-6-luna', isDefault: false, options: [] }] },
      { instanceId: 'claudeAgent', name: 'Claude Code', ready: true, models: [{ slug: 'claude-opus-5-5', name: 'Opus 5.5', isDefault: true, options: [] }] }] };
  const server = require(path.join(root, 'electron/t3server.cjs'));
  Object.assign(server, {
    usageLimits: async () => ({ providers: [] }), status: async () => ({ paired: true }), closeSock: () => {}, listProviders: async () => runtime.providers,
    hireConfig: async () => structuredClone(runtime),
    // Production payload construction; only the T3 launch itself is recorded instead of sent.
    startHire: async opts => {
      const payload = require(path.join(root, 'electron/hire-runtime.cjs')).launchPayload(opts, runtime.runtimeMode);
      calls.launches.push(payload);
      data.threads.unshift(T(payload.threadId, payload.title, payload.modelSelection.instanceId, payload.modelSelection.model, 'running'));
      return { threadId: payload.threadId };
    },
    settleThread: async (id) => { calls.settles.push(id); const t = data.threads.find(t => t.id === id); if (t) t.settled = true; },
    dispatch: async command => { calls.dispatches.push(command); },
    call: async tag => { throw Error('External T3 call forbidden in fixture: ' + tag); },
  });
  const usage = require(path.join(root, 'electron/usage.cjs'));
  const totals = { tokens: 0, costUsd: 0, byHarness: {}, byModel: {}, byProject: {} };
  Object.assign(usage, { getSessionUsage: async () => ({ available: false, tokens: null, costUsd: null }), getUsage: async () => ({ updatedAt: stamp, windows: { today: totals, week: totals, last5h: totals }, limits: {}, errors: [] }),
    getCoinSources: async () => [{ key: 'k-w3', threadId: 'w3', title: data.threads[2].title, status: 'completed', costUsd: 1.2 }] });
  Object.assign(require(path.join(root, 'electron/environments.cjs')), { getEnvironments: async () => ({ localId: 'fixture', buildings: [{ id: 'fixture', label: 'Fixture', local: true }] }) });
  Object.assign(require(path.join(root, 'electron/weather.cjs')), { getWeather: async () => null, lastError: () => null });
  require(path.join(root, 'electron/main.cjs'));

  const wait = ms => new Promise(r => setTimeout(r, ms));
  const report = { build, root, baseline, startedAt: stamp, synthetic: true, productionTouched: false, checks: [], captures: [], skipped: [] };
  const check = (name, ok, detail) => { report.checks.push({ name, ok: !!ok, detail: ok ? undefined : detail }); if (!ok) console.error('FAIL', name, JSON.stringify(detail ?? null).slice(0, 600)); };
  let win;
  const ev = code => win.webContents.executeJavaScript(code);
  const frames = () => ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(null))))');
  const capture = async (name, rect) => {
    await frames();
    const png = (await win.webContents.capturePage(rect)).toPNG(), file = path.join(out, name + '.png');
    fs.writeFileSync(file, png); report.captures.push({ name, file, sha256: sha(png), rect: rect ?? null });
  };
  const until = async (code, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await ev(code).catch(() => false)) return true; await wait(200); } return false; };
  app.whenReady().then(async () => {
    try {
      const end = Date.now() + 30000;
      while (!(win = BrowserWindow.getAllWindows()[0]) && Date.now() < end) await wait(100);
      win.setSize(1500, 960); win.show();
      const wc = win.webContents;
      // Source proof: the executing entry script, read back from V8, must equal the build file.
      const dbg = wc.debugger; dbg.attach('1.3'); const parsed = [];
      dbg.on('message', (_e, method, params) => { if (method === 'Debugger.scriptParsed' && /\/assets\/index-[^/]+\.js/.test(params.url)) parsed.push(params); });
      await dbg.sendCommand('Debugger.enable');
      check('office renderer started', await until('!!window.__world && !!window.__world.lastData && window.__world.rooms.length > 0', 40000));
      const entry = parsed.at(-1);
      if (entry) {
        const { scriptSource } = await dbg.sendCommand('Debugger.getScriptSource', { scriptId: entry.scriptId });
        const file = require('node:url').fileURLToPath(entry.url);
        report.source = { entry: path.relative(build, file), executingSha256: sha(Buffer.from(scriptSource, 'utf8')), buildFileSha256: sha(fs.readFileSync(file)) };
        check('executing renderer equals the build file', report.source.executingSha256 === report.source.buildFileSha256, report.source);
      } else check('executing renderer equals the build file', false, 'entry script not observed');
      await dbg.sendCommand('Debugger.disable'); dbg.detach();
      // Renderer seam (the fixture disables automatic review sync): hand the saved papers to the
      // office exactly as Orchestrator.runReportSync does.
      await ev(`(async()=>{const o=window.__orch,w=window.__world;o.papers=await window.lucid.reportsList();for(const p of o.papers){const t=w.lastData.threads.find(t=>t.id===p.threadId);if(!t||t.settled)continue;w.queueReport(t,p.response||'',!!p.delivered);w.setReportApproved?.(p.threadId,p.status==='approved');}await window.__refresh();})()`);
      await wait(9000);
      await ev(`window.__world.showRoom('p:lucid')`); await wait(2500);
      await capture('office');
      const seats = await ev(`(()=>{const w=window.__world;return Object.fromEntries([...w.desks].map(([id,d])=>[id,d.el.dataset.slot]))})()`);
      report.seatsBefore = seats;
      await ev(`window.__world.showRoom('queue')`);
      // Workers walk to the line at walking pace along the hall; capture once they are there.
      const arrived = baseline ? true : await until(`(()=>{const w=window.__world;return !w.transit.has('w4')&&w.rooms.find(r=>r.id==='queue').el.querySelectorAll('.world-walker[data-id="w4"]').length>0})()`, 60000);
      if (!baseline) check('the reviewing worker reaches the orchestrator line', arrived);
      await wait(2500); await capture('queue');
      report.queueTrail = [];
      for (let i = 0; i < 8; i++) { report.queueTrail.push(await ev(`(()=>{const w=window.__world,x=w.transit?.get?.('w4');return x?{x:Math.round(x.x),y:Math.round(x.y),act:x.activity,held:w.physicalLayoutHeld,room:w.roomOf.get('w4')}:{gone:true,room:w.roomOf.get('w4')}})()`)); await wait(1500); }
      report.queueProbe = await ev(`(()=>{const w=window.__world,q=w.rooms.find(r=>r.id==='queue');return {roomOf:w.roomOf?.get?.('w4')??null,inQueueEl:q?q.el.querySelectorAll('.world-walker').length:-1,ids:q?[...q.el.querySelectorAll('.world-walker')].map(e=>e.dataset.id):[],transit:[...(w.transit?.keys?.()??[])],ext:!!w.ext?.queue,list:(w.extLists?.queue??[]).map(x=>x.id),walkers:[...document.querySelectorAll('.world-walker')].map(e=>e.dataset.id)}})()`);
      const list = await ev(`(()=>{const r=document.getElementById('th-list').closest('.panel')||document.getElementById('th-list');const b=r.getBoundingClientRect();return {x:Math.max(0,Math.floor(b.x)),y:Math.max(0,Math.floor(b.y)),width:Math.ceil(Math.min(b.width,520)),height:Math.ceil(Math.min(b.height,innerHeight-b.y))}})()`);
      await capture('thread-list', list);
      if (!baseline) {
        check('sidebar header stays on one line', await ev(`(()=>{const h=document.querySelector('.th-head');const kids=[...h.children].map(c=>c.getBoundingClientRect());return kids.every(r=>Math.abs(r.top-kids[0].top)<12)})()`), await ev(`(()=>{const h=document.querySelector('.th-head');return {w:h.getBoundingClientRect().width,kids:[...h.children].map(c=>[c.className,Math.round(c.getBoundingClientRect().left),Math.round(c.getBoundingClientRect().top),Math.round(c.getBoundingClientRect().width)])}})()`));
        check('old saved history does not stretch the office', await ev(`(()=>{const p=window.__world.physicalPlans.find(p=>p.id==='p:lucid');return !!p&&p.slots<=6})()`), await ev(`window.__world.physicalPlans.find(p=>p.id==='p:lucid')?.slots`));
        check('worker thread rows show the worker face, title and name', await ev(`(()=>{const r=document.querySelector('#th-list .th-worker[data-id="w1"]');return !!r&&!!r.querySelector('.mg-face svg')&&r.querySelector('.th-title').textContent.includes('settings panel')&&r.textContent.includes('Mochi')})()`));
        check('in-review worker waits in the orchestrator line while its desk keeps its place', await ev(`(()=>{const w=window.__world;return w.desks.has('w4')&&(w.extLists?.queue??[]).some(q=>q.id==='w4')})()`), await ev(`({desks:[...window.__world.desks.keys()],queue:(window.__world.extLists?.queue??[]).map(q=>q.id)})`));
      }
      // Desk with approved work: its report and a single Collect button.
      await ev(`(()=>{const w=window.__world;w.unfocus?.();const d=w.desks.get('w3');if(d){w.select(d);w.focusOn(d);}})()`); await wait(2500);
      await capture('approved-desk');
      if (!baseline) {
        const screen = await ev(`(()=>{const d=window.__world.desks.get('w3');const p=d?.el.querySelector('.monitor-task-done');return p?{buttons:[...p.querySelectorAll('button')].map(b=>b.textContent.trim()),summary:p.querySelector('.monitor-task-summary')?.textContent}:null})()`);
        check('approved desk shows its report and only a Collect button', screen && screen.buttons.length === 1 && /^Collect/.test(screen.buttons[0]) && /toggle works/.test(screen.summary || ''), screen);
        check('in-review desk shows no completion screen', await ev(`!window.__world.desks.get('w4')?.el.querySelector('.monitor-task-done')`));
        await ev(`window.__world.desks.get('w3').el.querySelector('.monitor-task-collect').click()`);
        await wait(700); await capture('collect-flight');
        await until(`!window.__world.desks.has('w3')`, 15000);
        check('collect settles through the review and clears the desk', calls.settles.includes('w3') && await ev(`!window.__world.desks.has('w3')`), { settles: calls.settles });
        check('collected paper is settled', (await ev(`window.lucid.reportsList()`)).find(p => p.id === 'paper-w3')?.status === 'settled');
        check('coins were paid on collect', await ev(`window.__wallet.rewards.every(r=>r.id!=='w3')`));
        const after = await ev(`(()=>{const w=window.__world;return Object.fromEntries([...w.desks].map(([id,d])=>[id,d.el.dataset.slot]))})()`);
        await ev(`window.__clearedSlot=${JSON.stringify(seats.w3)}`);
        check('the collected desk stays in place as an empty hire spot', await until(`window.__world.freeDesks.some(d=>d.el.dataset.slot===${JSON.stringify(seats.w3)})`, 20000), { slot: seats.w3, free: await ev(`window.__world.freeDesks.map(d=>d.el.dataset.slot)`) });
        check('no other desk moved when the job was collected', Object.entries(seats).filter(([id]) => id !== 'w3').every(([id, slot]) => after[id] === slot), { seats, after });
        await ev(`window.__world.unfocus?.();window.__world.showRoom('p:lucid')`); await wait(2200); await capture('office-after-collect');
      }
      // Hire on a free desk through the production composer.
      await ev(`window.__world.unfocus?.();window.__world.showRoom('p:lucid')`); await wait(1500);
      // After a collect, hire into exactly the desk it cleared; otherwise any free desk.
      const free = await ev(`(()=>{const w=window.__world;const d=w.freeDesks.find(d=>d.el.dataset.slot===window.__clearedSlot)||w.freeDesks.find(d=>d.el.dataset.slot.startsWith('p:lucid'))||w.freeDesks[0];if(!d)return null;d.el.click();return d.el.dataset.slot})()`);
      check('a free desk can be clicked to hire', !!free, free);
      await until(`!!document.querySelector('.hire-wrap')&&!!document.querySelector('[data-setting=model]')`, 10000); await wait(900);
      await capture('hire');
      if (!baseline) {
        check('composer previews the free worker with this harness and model', await ev(`document.querySelector('#hire-worker-name').textContent==='Byte'&&!!document.querySelector('.hire-stage-floor .world-walker')`), await ev(`document.querySelector('#hire-worker-name')?.textContent`));
        await ev(`(()=>{const t=document.querySelector('.hire-task textarea');t.value='Make the shop sign glow at night';t.dispatchEvent(new Event('input',{bubbles:true}));const i=document.querySelector('.hire-files'),dt=new DataTransfer();dt.items.add(new File(['sign spec'],'sign-spec.txt',{type:'text/plain'}));i.files=dt.files;i.dispatchEvent(new Event('change'));document.querySelector('.hire form, form.hire').requestSubmit();})()`);
        await until(`!document.querySelector('.hire-wrap')`, 15000); await wait(4000);
        const launch = calls.launches.at(-1);
        const attached = launch?.initialMessage?.text.match(/- file: (.+)$/m)?.[1];
        check('hire launched one thread with the chosen runtime', calls.launches.length === 1 && launch.modelSelection.instanceId === 'codex' && launch.modelSelection.model === 'gpt-6.1-sol', launch);
        check('attachment saved and referenced in the task', !!attached && fs.existsSync(attached) && fs.readFileSync(attached, 'utf8') === 'sign spec' && attached.startsWith(home), attached);
        const hired = await ev(`(()=>{const w=window.__world,id=${JSON.stringify(launch?.threadId)},r=w.roster.byThread(id),d=w.desks.get(id);return {robot:r&&{id:r.id,name:r.name,look:r.look,done:r.done},slot:d?.el.dataset.slot}})()`);
        check('the shown worker took the job with its identity, look and history', hired.robot?.id === 'bot-byte' && hired.robot.name === 'Byte' && JSON.stringify(hired.robot.look) === JSON.stringify(roster[0].look) && hired.robot.done?.includes('s-byte'), hired);
        check('the new job sits at exactly the clicked desk', hired.slot === free, { hired: hired.slot, free });
        check('it was the desk the collected job left', free === report.seatsBefore.w3, { free, cleared: report.seatsBefore.w3 });
        await wait(3000); await capture('office-after-hire');
        // Worker focus view.
        await ev(`(()=>{const d=window.__world.desks.get('w1');window.__world.onRobotFocus('w1',d.el.querySelector('.robot-host'))})()`); await wait(1200);
        await capture('worker-focus');
        check('focus view shows name, setup, persona and locks retrain while working', await ev(`(()=>{const f=document.querySelector('.wf');return !!f&&f.querySelector('#wf-name').textContent==='Mochi'&&f.querySelectorAll('.wf-persona li').length>=3&&f.querySelector('.wf-retrain').disabled&&!!document.querySelector('.wf-float .world-walker')})()`));
        await ev(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`); await wait(500);
        check('focus view closes and releases its robot', await ev(`!document.querySelector('.wf-wrap')&&!document.querySelector('.wf-float')`));
        // The orchestrator's chair.
        await ev(`document.getElementById('orch-controls-open').click()`); await wait(300);
        await ev(`document.querySelector('[data-chair]').click()`); await wait(1800);
        await capture('chair');
        check('chair shows the waiting report from its worker', await ev(`(()=>{const c=document.querySelector('.chair');return !!c&&c.querySelector('.chair-paper h3')?.textContent.includes('break room signs')&&c.querySelectorAll('.chair-line .world-walker').length>=1})()`));
        check('taking the chair rests the orchestrator', await ev(`window.__orch.state.paused===true&&window.__orch.state.presence==='away'`));
        await ev(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`); await wait(400);
        check('leaving the chair restores the orchestrator state', await ev(`!document.querySelector('.chair-wrap')&&window.__orch.state.presence==='sleep'`));
      }
      report.calls = calls;
      report.errors = await ev('window.__errs||[]');
      check('no renderer errors', !report.errors.length, report.errors);
    } catch (error) { check('fixture completed', false, String(error.stack || error)); }
    report.ok = report.checks.every(c => c.ok);
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ok: report.ok, passed: report.checks.filter(c => c.ok).length, failed: report.checks.filter(c => !c.ok).map(c => c.name), out }, null, 1));
    app.exit(report.ok ? 0 : 1);
  });
}
