// Native end-to-end rendering and persistence check. T3 and usage are fixture adapters;
// the production renderer, IPC, report service, routing, printer and manual review run intact.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
if (!process.versions.electron) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  require('node:child_process').spawn(require('electron'), [__filename, ...process.argv.slice(2)], { env, windowsHide: true, stdio: 'inherit' }).on('exit', c => process.exit(c || 0));
} else {
  const { app, BrowserWindow } = require('electron');
  const out = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-printer-flow-')));
  const build = path.resolve(process.argv[3] || 'dist');
  fs.mkdirSync(out, { recursive: true });
  app.setPath('userData', path.join(out, 'profile')); fs.mkdirSync(app.getPath('userData'), { recursive: true });
  app.disableHardwareAcceleration();
  process.env.LUCID_SHOT = out; process.env.LUCID_SHOT_PROFILE = app.getPath('userData');
  process.env.LUCID_SHOT_EVERY = '600000'; process.env.LUCID_SHOT_COUNT = '1000';
  process.env.LUCID_AUTO_SCOPE = 'Fixture office';
  process.env.LUCID_DEV_URL = require('node:url').pathToFileURL(path.join(build, 'index.html')).href;
  const settings = { orch: { threadId: 'fixture-boss', projectId: 'fixture-project', review: true, reviewWorkflow: 1, paused: true, auto: false, learned: 0, reviewed: {}, lastSentAt: Date.now(), seenUntil: new Date().toISOString() } };
  fs.writeFileSync(path.join(app.getPath('userData'), 'settings.json'), JSON.stringify(settings));
  const historicalDir = path.resolve('docs/evidence/printer-handoff-2026-10-31');
  const historicalResult = JSON.parse(fs.readFileSync(path.join(historicalDir, 'result.json'), 'utf8'));
  const oldRoster = JSON.parse(fs.readFileSync(path.join(path.dirname(historicalResult.captures[0]), 'profile', 'roster.json'), 'utf8'));
  const savedRobot = oldRoster.find(r => r.threadId === 'fixture-worker');
  assert(savedRobot?.look, 'a genuinely saved fixture robot appearance is required');
  fs.writeFileSync(path.join(app.getPath('userData'), 'roster.json'), JSON.stringify([savedRobot]));
  const historicalImages = [
    { type: 'image', name: 'Before, historical workflow fixture.png', path: path.join(historicalDir, '01-before-completion.png') },
    { type: 'image', name: 'After, historical delivery fixture.png', path: path.join(historicalDir, '04-delivered-paused.png') },
  ];
  const stamp = new Date().toISOString();
  const worker = { id: 'fixture-worker', projectId: 'fixture-project', title: 'Printer delivery integration fixture', provider: 'codex', model: 'Fixture model', updatedAt: stamp, runStatus: 'running', question: null, pinned: false, settled: false };
  const boss = { ...worker, id: 'fixture-boss', title: 'Orchestrator', runStatus: 'completed' };
  const data = { projects: [{ id: 'fixture-project', title: 'Fixture office', root: out, icon: null, scratch: false }], threads: [worker, boss], models: {}, prices: {}, shipped: { total: 0, today: 0 } };
  const info = id => ({ id, title: id === worker.id ? worker.title : boss.title, provider: 'codex', model: 'Fixture model', effort: 'high', queued: [], root: out, projectTitle: 'Fixture office', run: { id: id + '-run', status: id === worker.id ? worker.runStatus : boss.runStatus } });
  const facts = () => ({ ...info(worker.id), pinned: worker.pinned, settled: worker.settled, pendingRuns: worker.runStatus === 'running' ? 1 : 0, pendingRequests: 0, originalRequest: 'Exercise report delivery in an isolated native fixture.', children: [{ id: 'fixture-helper', title: 'Fixture reviewer', provider: 'claudeAgent', model: 'Fixture reviewer model', effort: 'medium' }], team: [{ threadId: worker.id, title: worker.title, role: 'Owner', provider: 'codex', model: 'Fixture model', effort: 'high', runIds: ['fixture-owner-run'] }, { threadId: 'fixture-helper', title: 'Fixture reviewer', role: 'Subagent', provider: 'claudeAgent', model: 'Fixture reviewer model', effort: 'medium', runIds: ['fixture-helper-run'] }], sessions: [], messages: [{ role: 'assistant', text: 'Native report flow fixture completed. This checks delivery mechanics, not a real coding task. Comparison images are genuine historical workflow fixture captures, used here to test image readability.', streaming: false, attachments: historicalImages }] });
  const t3 = require('../../electron/t3.cjs');
  const sends = [], settlements = [];
  Object.assign(t3, { world: () => structuredClone(data), reportFacts: facts, reportState: facts, officeTasks: () => [], threadInfo: info, listProjects: () => data.projects, listThreads: () => data.threads, listProjectsWithCounts: () => data.projects, watchThread: () => () => {}, conversation: () => facts().messages, conversationPage: () => ({ messages: facts().messages, hasMore: false, cursor: null }), pendingRequests: () => [], repliesSince: () => ({ messages: [], exists: true, runStatus: 'completed' }), userMessagesSince: () => [], resolvedRequestsSince: () => [], itemsSince: () => [], recentItems: () => [], sendMessage: async m => { sends.push(m); return { ok: true }; } });
  const server = require('../../electron/t3server.cjs');
  Object.assign(server, { settleThread: async id => { settlements.push(id); worker.settled = true; }, unsettleThread: async () => { worker.settled = false; }, usageLimits: async () => ({ providers: [] }), closeSock: () => {}, status: async () => ({ paired: true }), dispatch: async () => { throw Error('Unexpected external mutation in fixture'); } });
  const totals = { tokens: 0, costUsd: 0, byHarness: {}, byModel: {}, byProject: {} };
  Object.assign(require('../../electron/usage.cjs'), { getSessionUsage: async () => ({ available: false, tokens: null, costUsd: null }), getUsage: async () => ({ updatedAt: stamp, windows: { today: totals, week: totals, last5h: totals }, limits: {}, errors: [] }) });
  Object.assign(require('../../electron/environments.cjs'), { getEnvironments: async () => ({ localId: 'fixture', buildings: [{ id: 'fixture', label: 'Fixture office', local: true }] }) });
  Object.assign(require('../../electron/weather.cjs'), { getWeather: async () => null, lastError: () => null });
  require('../../electron/main.cjs');
  const wait = ms => new Promise(r => setTimeout(r, ms));
  let win;
  const ev = expression => win.webContents.executeJavaScript(expression);
  async function until(expression, label, timeout = 45000) {
    const start = Date.now();
    while (Date.now() - start < timeout) { if (await ev(expression)) return; await wait(80); }
    throw Error('Timed out: ' + label + ' ' + JSON.stringify(await ev(`(()=>{const w=window.__world;return {reports:[...w.reports],transit:[...w.transit].map(([id,a])=>({id,x:a.x,y:a.y})),rooms:w.rooms.map(r=>({id:r.id,x:r.x,y:r.y,w:r.w,h:r.h})),line:w.ext.queue?.line?.map(q=>({id:q.id,slot:q.slot})),trips:w.trips.size}})()`)));
  }
  const captures = [];
  async function capture(name) { await wait(120); const file = path.join(out, name + '.png'); fs.writeFileSync(file, (await win.webContents.capturePage()).toPNG()); captures.push(file); }
  app.whenReady().then(async () => {
    try {
      await wait(200); win = BrowserWindow.getAllWindows()[0];
      await until('!!window.__world?.desks.get("fixture-worker")', 'worker desk');
      await ev('window.__printerOfficeId=window.__world.desks.get("fixture-worker").room;window.__world.showRoom(window.__printerOfficeId)'); await wait(700);
      assert(await ev('document.querySelector("#orch-paused").checked'), 'paused control is checked');
      await capture('01-before-completion');
      // Capture every actual phase from the production actor, without inventing positions.
      await ev(`(()=>{const w=window.__world;window.__printerPhases=[];const timer=setInterval(()=>{const a=w.transit.get('fixture-worker');if(!a)return;if(a.carryingReport&&!window.__printerPhases.includes('pickup'))window.__printerPhases.push('pickup');},20);window.__printerTimer=timer})()`);
      worker.runStatus = 'completed'; worker.updatedAt = new Date().toISOString();
      await ev('window.__refresh()'); await wait(100); await ev('window.__refresh()');
      await until(`(()=>{const a=window.__world.transit.get('fixture-worker');return !!a&&a.bubble?.textContent?.includes('Printing')})()`, 'printer output', 45000);
      const station = await ev(`(()=>{const w=window.__world;const a=w.transit.get('fixture-worker');const cabinet=w.rooms.find(r=>r.id===window.__printerOfficeId).el.querySelector('.office-printer');const sheet=cabinet.querySelector('.report-sheet');return {cabinet:cabinet.getBoundingClientRect().toJSON(),actor:a.el.getBoundingClientRect().toJSON(),sheet:sheet.getBoundingClientRect().toJSON(),opacity:getComputedStyle(sheet).opacity}})()`);
      assert(station.cabinet.width > 0, 'separate cabinet is visible');
      assert(station.opacity > 0, 'paper output animation is visible');
      await capture('02-printer-output');
      await until('window.__world.transit.get("fixture-worker")?.carryingReport', 'pickup');
      await capture('03-report-pickup');
      await ev('window.__world.showRoom("queue")');
      await until('window.__world.reports.get("fixture-worker")?.arrived', 'delivery at review desk');
      await capture('04-delivered-paused');
      const papers = await ev('window.lucid.reportsList()'); assert.equal(papers.length, 1); assert.equal(papers[0].status, 'submitted'); assert.equal(sends.length, 0, 'pause sends no automatic review');
      await ev(`document.querySelector('#orch-archive').click()`); await until('!!document.querySelector(".paper-register-row")', 'archive row');
      await ev('document.querySelector(".paper-register-row").click()'); await until('!!document.querySelector(".paper-manual")', 'manual review');
      await until(`[...document.querySelectorAll('.paper-image-group img')].length===2&&[...document.querySelectorAll('.paper-image-group img')].every(i=>i.complete&&i.naturalWidth>0)`, 'before/after image decode');
      const presentation = await ev(`(()=>{const p=document.querySelector('.settlement-paper');return {portrait:p.querySelector('.paper-portrait svg')?.getAttribute('style'),width:p.getBoundingClientRect().width,viewport:innerWidth,images:[...p.querySelectorAll('.paper-image-group img')].map(i=>({width:i.clientWidth,height:i.clientHeight,naturalWidth:i.naturalWidth,naturalHeight:i.naturalHeight})),fullReportFolded:!p.querySelector('.paper-full').open}})()`);
      assert(presentation.portrait?.includes('--acc:' + (savedRobot.look.accent || '#ff9f5a')), 'portrait uses the saved robot accent');
      assert(presentation.images.every(i => i.width >= 300 && i.height >= 200), 'before and after images have readable display space');
      assert(presentation.images.every(i => Math.abs(i.width/i.height - i.naturalWidth/i.naturalHeight) < 0.02), 'images preserve natural proportions without empty bands');
      assert(await ev(`(()=>{const p=document.querySelector('.settlement-paper');return p.textContent.includes('Harness')&&p.textContent.includes('Thinking effort')&&p.textContent.includes('high')&&p.textContent.includes('medium')&&p.textContent.includes('Fixture reviewer model')&&p.querySelector('[data-related-thread="fixture-worker"]')?.href.includes('thread=fixture-worker')&&p.querySelector('.paper-thread code').textContent==='fixture-worker'})()`), 'harness, model, effort, team, thread ID and source link render');
      assert(presentation.fullReportFolded && presentation.width <= presentation.viewport, 'compact report keeps secondary details folded and stays in viewport');
      await capture('05-latest-report-comparison');
      await ev(`(()=>{const d=document.querySelector('.paper-manual');d.open=true;d.querySelector('[data-summary]').value='Verified printer output, pickup, delivery and pause in the native integration fixture.';d.querySelector('[data-checks]').value='Production actor carried report to the desk.\\nPause prevented automatic dispatch.\\nManual review persists its decision.';d.scrollIntoView({block:'center'})})()`);
      await capture('05-manual-review');
      await ev('document.querySelector("[data-action=approve]").click()');
      await until('document.querySelector(".paper-owner")?.textContent.includes("Settled")', 'saved settlement decision');
      await ev('document.querySelector(".paper-body").scrollTop=0');
      await capture('06-after-saved-decision');
      const loadedAssets = await ev('[...document.scripts].map(s=>s.src).filter(Boolean)');
      const saved = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'reports', 'index.json'), 'utf8'));
      assert.equal(saved[0].status, 'settled'); assert.equal(saved[0].reviewer, 'You'); assert.equal(settlements.length, 1); assert(saved[0].history.some(h => h.action === 'Settled in T3'));
      fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ ok: true, fixtureAdapters: ['T3 reads and mutations', 'usage', 'weather'], productionComponents: ['built renderer', 'IPC', 'report service', 'office routing', 'printer output', 'walker paper pickup', 'review queue', 'pause control', 'manual review', 'saved decision'], captures, loadedAssets, station, presentation, savedRobot: { name: savedRobot.name, look: savedRobot.look }, paper: saved[0], buildManifest: JSON.parse(fs.readFileSync(path.join(build, 'lucid-build.json'), 'utf8')) }, null, 2));
      console.log('PASS native printer flow. Evidence: ' + out); app.exit(0);
    } catch (e) { console.error(e); if (win) await capture('failure').catch(() => {}); app.exit(1); }
  });
}
