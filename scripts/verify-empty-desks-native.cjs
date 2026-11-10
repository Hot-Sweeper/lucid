// Native production fixture for workers and desks: the real Electron main process and the
// real renderer build, with T3 Code replaced by synthetic office data. T3 transport calls are
// recorded instead of sent, so no live thread, account or file outside <out> is touched.
//   node scripts/verify-workers-native.cjs <out> <build dir> [backend root] [baseline]
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
  const root = path.resolve(process.argv[4] || path.join(__dirname, '..')), baseline = process.argv[5] === 'baseline';
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
  const prefs = (i) => ({ editor: ['studio', 'pad', 'vim'][i % 3], wallpaper: i, games: { snake: .4, flappy: .8, dash: .2, chess: .6 }, phone: 'clips', subagents: 'cli', music: .4, social: .5, mug: '#ff9f5a', tasks: 'checklist', hobby: ['gamer', 'musician', 'chatter', 'watcher', 'chiller', 'gamer'][i], windows: ['tiler', 'floating', 'fullscreen'][i % 3], listens: 'sometimes', launch: 'dock', switching: 'click', tidiness: 'normal', git: 'cli', office: 'none', apps: ['doodle', 'crossword'], socials: ['botsapp', 'chirp'], socialsV: 2, t3: 'stable', chatApp: 'native', notesApp: 'notepad', leisure2: true });
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
    officeTasks: () => [], listProjects: () => data.projects, listThreads: () => data.threads, listProjectsWithCounts: () => data.projects,
    watchThread: () => () => {}, conversation: () => [], conversationPage: () => ({ messages: [], hasMore: false, cursor: null }),
    pendingRequests: () => [], requestOutcome: () => null, repliesSince: () => ({ messages: [], exists: true, runStatus: 'idle' }), userMessagesSince: () => [], resolvedRequestsSince: () => [],
    itemsSince: () => [], recentItems: () => [], reportState: state, reportFacts: state, coinBindings: () => [] });
  const runtime = { source: 'T3 defaults', runtimeMode: 'full-access', selection: { providerInstanceId: 'codex', model: 'gpt-6.1-sol', options: { reasoningEffort: 'high' } },
    providers: [{ instanceId: 'codex', name: 'Codex', ready: true, models: [{ slug: 'gpt-6.1-sol', name: 'gpt-6.1-sol', isDefault: true, options: [{ id: 'reasoningEffort', label: 'Reasoning', type: 'select', choices: [{ id: 'low', label: 'Low', isDefault: false }, { id: 'high', label: 'High', isDefault: true }] }] }, { slug: 'gpt-6-luna', name: 'gpt-6-luna', isDefault: false, options: [] }] },
      { instanceId: 'claudeAgent', name: 'Claude Code', ready: true, models: [{ slug: 'claude-opus-5-5', name: 'Opus 5.5', isDefault: true, options: [] }] }] };
  const server = require(path.join(root, 'electron/t3server.cjs'));
  Object.assign(server, {
    usageLimits: async () => ({ providers: [] }), status: async () => ({ paired: true }), closeSock: () => {}, listProviders: async () => runtime.providers,
    hireConfig: async () => structuredClone(runtime), hireContexts: () => [],
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
  app.whenReady().then(async()=>{
    let win;
    try {
      for(let i=0;i<100&&!win;i++){win=BrowserWindow.getAllWindows()[0];await wait(100)}
      win.webContents.on('console-message',(_e,_l,m)=>console.log('renderer:',m));win.setFocusable(true);win.focus();win.setPosition(0,0);win.setSize(1280,800);win.show();
      const ev=code=>win.webContents.executeJavaScript('(async()=>{try{return await (async()=>{return '+code+'})()}catch(e){return {error:e.message,stack:e.stack}}})()',true).then(r=>{if(r?.error)throw Error(JSON.stringify(r));return r});
      for(let i=0;i<200;i++){if(await ev('!!window.__world?.lastData'))break;await wait(100)}
      await ev(`(()=>{const w=window.__world;w.reports.clear();w.roomColumns.set('p:lucid',4);w.extra.set('p:lucid',6);w.expandedRooms.add('p:lucid');w.setRoomExpanded('p:lucid',true);w.update(w.lastData);w.showRoom('p:lucid');})()`);
      for(let i=0;i<200;i++){if(await ev(`([...window.__world.slotDesks.values()].filter(d=>d.room==='p:lucid'&&!d.threadId).length>=6)`))break;await wait(200)}await wait(2500);
      const capture=async name=>fs.writeFileSync(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());
      await ev(`(()=>{const w=window.__world;const d=[...w.slotDesks.values()].find(d=>d.room==='p:lucid'&&!d.threadId);window.__emptySlot=d.el.dataset.slot;w.onFreeDeskMenu(d,d.el.dataset.slot,580,350)})()`);
      await wait(350);await capture('empty-desk-menu');
      const result=await ev(`(()=>{const b=[...document.querySelectorAll('.pop-menu:last-child button')].find(b=>b.textContent.includes('Remove this desk'));return {removeAvailable:!!b,slot:window.__emptySlot,extras:window.__world.extra.get('p:lucid')}})()`);
      if(!baseline){
        if(!result.removeAvailable)throw Error('Remove action missing');
        await ev(`[...document.querySelectorAll('.pop-menu:last-child button')].find(b=>b.textContent.includes('Remove this desk')).click()`);await wait(1800);
        const extra=await ev(`window.__world.extra.get('p:lucid')`);if(extra!==5)throw Error('Removal did not reduce capacity');
        await capture('after-remove');
        result.closeButton = await ev(`(()=>{const w=window.__world,d=[...w.slotDesks.values()].find(d=>d.room==='p:lucid'&&!d.threadId),b=d.el.querySelector('.empty-desk-remove');b.focus();b.click();return !!b&&!b.disabled})()`);
        if(!result.closeButton)throw Error('Vacant desk close control missing or disabled');
        await wait(1500);
        if(await ev(`window.__world.extra.get('p:lucid')`)!==4)throw Error('Direct close did not remove one spare');
        const priorSlots=await ev(`window.__world.physicalPlans.find(p=>p.id==='p:lucid').slots`);
        data.threads.push(T('new-hire','Use the existing empty desk','codex','gpt-6.1-sol','running'));
        await ev(`window.__world.update(await window.lucid.world())`);await wait(2000);
        result.hireConsumesSpare=await ev(`window.__world.extra.get('p:lucid')===3`);
        if(!result.hireConsumesSpare)throw Error('Hiring cloned a vacant workstation');
        result.sameCapacity=await ev(`window.__world.physicalPlans.find(p=>p.id==='p:lucid').slots===${priorSlots}`);
        if(!result.sameCapacity)throw Error('Using a spare unexpectedly grew the room');
        await ev(`(()=>{const w=window.__world;w.onRoomMenu(w.rooms.find(r=>r.id==='p:lucid'),580,350)})()`);
        await wait(250);await capture('office-cleanup-menu');
        await ev(`(()=>{const menu=[...document.querySelectorAll('.pop-menu')].at(-1);const b=[...menu.querySelectorAll('button')].find(b=>b.textContent.includes('Remove')&&b.textContent.includes('empty desk'));if(!b)throw Error('Bulk cleanup missing');b.click()})()`);
        for(let i=0;i<100;i++){if(await ev(`![...window.__world.slotDesks.values()].some(d=>d.room==='p:lucid'&&!d.threadId)`))break;await wait(100)}
        result.bulkRemoved=await ev(`![...window.__world.slotDesks.values()].some(d=>d.room==='p:lucid'&&!d.threadId)`);
        if(!result.bulkRemoved)throw Error('Bulk cleanup left vacant desks');
        await capture('tidy-office');
        await ev(`(()=>{const w=window.__world;w.extra.set('main',1);w.setRoomExpanded('main',true);w.update(w.lastData);w.showRoom('main');})()`);await wait(1500);
        for(let i=0;i<100;i++){if(await ev(`window.__world.freeDesks.some(d=>d.room==='main')`))break;await wait(100)}
        await ev(`(()=>{const w=window.__world;const d=[...w.slotDesks.values()].find(d=>d.room==='main'&&!d.threadId);w.onFreeDeskMenu(d,d.el.dataset.slot,580,350)})()`);
        await wait(350);await ev(`[...document.querySelectorAll('.pop-menu:last-child button')].find(b=>b.textContent.includes('Remove this desk')).click()`);await wait(1500);
        for(let i=0;i<100;i++){if(await ev(`![...window.__world.slotDesks.values()].some(d=>d.room==='main')`))break;await wait(200)}result.lastEmptyDeskRemoved=await ev(`![...window.__world.slotDesks.values()].some(d=>d.room==='main')`);
        if(!result.lastEmptyDeskRemoved){console.log(await ev(`JSON.stringify({extra:window.__world.extra.get('main'),plans:window.__world.physicalPlans.filter(p=>p.id==='main'),pending:window.__world.pendingSeat,held:window.__world.physicalLayoutHeld})`));await capture('last-desk-debug');throw Error('Last empty desk remains');}
        await capture('after-last-desk');
        result.addStillAvailable=await ev(`(()=>{const b=document.querySelector('.desk-ghost[aria-label="Add a desk to Main office"]');if(!b)throw Error('No Add a desk control after removing the last one');b.click();return true})()`);
        for(let i=0;i<100;i++){if(await ev(`window.__world.freeDesks.some(d=>d.room==='main')`))break;await wait(100)}
        result.addRestoresDesk=await ev(`window.__world.freeDesks.some(d=>d.room==='main')`);
        if(!result.addRestoresDesk)throw Error('Add a desk did not restore an empty office');
        await ev(`(()=>{const w=window.__world;w.update(w.lastData);return true})()`);
        if(await ev(`window.__world.extra.get('p:lucid')`)!==0)throw Error('Refresh restored removed spare capacity');
        result.workingDesksPreserved=await ev(`['w1','w2','new-hire'].every(id=>window.__world.desks.has(id))`);
        if(!result.workingDesksPreserved)throw Error('Cleanup removed active work');
        await wait(500);win.webContents.reload();
        for(let i=0;i<200;i++){if(await ev(`!!window.__world?.lastData`))break;await wait(100)}
        result.survivesReload=await ev(`window.__world.extra.get('p:lucid')===0&&window.__world.freeDesks.filter(d=>d.room==='p:lucid').length===0`);
        if(!result.survivesReload)throw Error('Reload recreated removed empty desks');
        await ev(`window.__world.showRoom('p:lucid')`);await wait(800);await capture('tidy-office-after-reload');
      }
      fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));app.exit(0);
    }catch(e){console.error(e);app.exit(1)}
  });
}
