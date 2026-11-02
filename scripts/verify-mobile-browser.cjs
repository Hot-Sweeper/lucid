const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
if (!process.versions.electron) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-mobile-browser-'));
  const env = { ...process.env, LUCID_SHOT: out, LUCID_SHOT_PROFILE: path.join(out, 'profile'), LUCID_SHOT_EVERY: '3600000' };
  delete env.ELECTRON_RUN_AS_NODE; delete env.LUCID_DEV_URL;
  require('node:child_process').spawn(require('electron'), [__filename, out], { env, stdio: 'inherit' }).on('exit', c => process.exit(c ?? 1));
} else {
  const { app, BrowserWindow, session } = require('electron');
  const out = process.argv[2];
  const root = path.join(__dirname, '..');
  const seed = path.join(out, 'seed'); fs.mkdirSync(seed, { recursive: true });
  fs.writeFileSync(path.join(seed, 'settings.json'), '{}');
  app.setPath('userData', seed);
  fs.mkdirSync(process.env.LUCID_SHOT_PROFILE, { recursive: true });
  let desktop, phone, controls, writes = 0;
  const remoteCalls = [], errors = [];
  const now = new Date().toISOString();
  const thread = { id: 'mobile-fixture-thread', projectId: 'mobile-fixture-project', title: 'Phone compatibility review with a long project task title', updatedAt: now, provider: 'codex', runStatus: 'running', pinned: false, settled: false, question: null, model: 'gpt-6.1-sol' };
  const project = { id: thread.projectId, title: 'Mobile fixture office', root: out, icon: null, scratch: false };
  const data = { projects: [project], threads: [thread], models: { codex: ['gpt-6.1-sol'] }, prices: {}, shipped: { total: 0, today: 0 } };
  const conversation = [{ id: 'fixture-user', role: 'user', text: 'Keep this conversation readable on a phone.', at: now, attachments: [] }, { id: 'fixture-assistant', role: 'assistant', text: 'The office, threads and chat keep their existing artwork and conversation layout.\n\n```ts\nconst phone = { width: 390, touch: true };\n```', at: now, attachments: [] }];
  const clone = value => structuredClone(value);
  const t3 = require('../electron/t3.cjs');
  Object.assign(t3, {
    world: () => clone(data), listProjects: () => clone([project]), listProjectsWithCounts: () => [{ ...project, threads: 1 }], listThreads: () => clone([thread]),
    office: () => clone({ project, threads: [thread] }), officeTasks: () => [], conversation: () => clone(conversation),
    conversationPage: () => ({ messages: clone(conversation), cursor: null, hasMore: false }), pendingRequests: () => [], itemsSince: () => [], recentItems: () => [],
    userMessagesSince: () => [], resolvedRequestsSince: () => [], requestOutcome: () => null,
    threadInfo: () => ({ id: thread.id, title: thread.title, provider: thread.provider, model: thread.model, run: { status: 'running' } }),
    watchThread: () => () => {}, coinBindings: () => [],
  });
  const rejectWrite = () => { writes++; throw Error('The mobile fixture cannot modify real T3 work.'); };
  for (const name of ['startThread', 'sendMessage', 'addProject', 'removeProject']) t3[name] = rejectWrite;
  const t3s = require('../electron/t3server.cjs');
  Object.assign(t3s, {
    status: async () => ({ paired: true, error: null, selection: { providerInstanceId: 'codex', model: thread.model, options: {} } }),
    listProviders: async () => [{ instanceId: 'codex', driver: 'codex', name: 'Codex', ready: true, models: [{ slug: thread.model, name: 'GPT-6.1 Sol', shortName: null, isDefault: true, options: [] }] }],
    usageLimits: async () => ({}), selection: () => ({ providerInstanceId: 'codex', model: thread.model, options: {} }),
  });
  for (const name of ['dispatch', 'call', 'startHire', 'settleThread', 'unsettleThread', 'reorderQueued', 'cancelQueued', 'editQueued', 'steerNow', 'setThreadModel', 'respondToRequest', 'ensurePaired']) t3s[name] = rejectWrite;
  const totals = { tokens: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0, byHarness: {}, byModel: {} };
  Object.assign(require('../electron/usage.cjs'), { getUsage: async () => ({ updatedAt: now, windows: { last5h: totals, today: totals, week: totals }, limits: {}, errors: [] }), getCoinSources: () => [] });
  Object.assign(require('../electron/weather.cjs'), { getWeather: async () => null, lastError: () => null });
  require('../electron/environments.cjs').getEnvironments = async () => ({ localId: 'mobile-fixture-local', connectionState: 'no-linked-environments', buildings: [{ id: 'mobile-fixture-local', label: 'Fixture desktop', local: true, canOpen: true, status: 'local' }] });
  require('../electron/mobile-access.cjs').createMobileAccess = options => {
    controls = options;
    return { restore: async () => {}, status: () => ({ enabled: false, running: false, busy: false, url: '', error: null }), setup: rejectWrite, disable: rejectWrite };
  };
  const mobileModule = require('../electron/mobile-server.cjs'), realServer = mobileModule.createMobileServer;
  mobileModule.createMobileServer = options => {
    console.log('Mobile browser: server factory entered');
    const service = realServer({ ...options, invoke: (client, channel, args) => { remoteCalls.push(channel); return options.invoke(client, channel, args); } });
    const listen = service.listen.bind(service);
    service.listen = async port => { console.log('Mobile browser: listening requested'); await listen(15187); console.log('Mobile browser: listen settled'); };
    return service;
  };
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const until = async (fn, message, timeout = 20000) => { const end = Date.now() + timeout; while (Date.now() < end) { if (await fn()) return; await delay(100); } throw Error(message); };
  const check = (ok, message) => { if (!ok) throw Error(message); console.log('PASS', message); };
  const capture = async name => { await delay(150); fs.writeFileSync(path.join(out, name + '.png'), (await phone.webContents.capturePage()).toPNG()); };
  let handled = false;
  let stage = 'desktop window creation';
  // Keep Node's loop moving while Electron resolves renderer promises. The
  // production path enters through IPC; this fixture calls its owner directly.
  const pump = setInterval(() => { if (desktop && !desktop.isDestroyed()) void desktop.webContents.executeJavaScript('1').catch(() => {}); }, 100);
  const watchdog = setTimeout(() => { console.error('Mobile browser timed out during', stage); app.exit(1); }, 45000);
  app.on('browser-window-created', (_e, win) => {
    if (handled) return; handled = true; desktop = win;
    stage = 'desktop page load'; console.log('Mobile browser: desktop window created');
    win.webContents.on('did-fail-load', (_ev, code, description) => console.error('Desktop load', code, description));
    win.webContents.on('console-message', event => { if (event.level === 'error') console.error('Desktop console:', event.message); });
    win.webContents.on('render-process-gone', (_ev, details) => console.error('Desktop renderer ended', details.reason));
    win.webContents.once('did-finish-load', async () => {
      const native = code => desktop.webContents.executeJavaScript(code);
      const browser = code => phone.webContents.executeJavaScript(code);
      try {
        stage = 'desktop companion readiness'; console.log('Mobile browser: desktop loaded');
        await until(() => native('!!window.__lucidCompanion && !!window.__world?.lastData'), 'Desktop companion owner did not initialize.');
        stage = 'HTTP bridge startup'; console.log('Mobile browser: desktop companion ready');
        await controls.start({ publicOrigin: 'http://127.0.0.1:15187', allowedLogin: 'fixture-owner' });
        const isolated = session.fromPartition('mobile-browser-' + Date.now());
        isolated.webRequest.onBeforeSendHeaders((details, callback) => {
          if (new URL(details.url).origin === 'http://127.0.0.1:15187') details.requestHeaders['Tailscale-User-Login'] = 'fixture-owner';
          callback({ requestHeaders: details.requestHeaders });
        });
        phone = new BrowserWindow({ width: 390, height: 844, show: false, webPreferences: { session: isolated, contextIsolation: true, backgroundThrottling: false, offscreen: true } });
        stage = 'phone renderer initialization';
        await phone.loadURL('about:blank');
        phone.webContents.debugger.attach('1.3');
        await phone.webContents.debugger.sendCommand('Page.enable');
        await phone.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: `window.__mobileErrors=[];addEventListener('error',e=>window.__mobileErrors.push(e.message));addEventListener('unhandledrejection',e=>window.__mobileErrors.push(String(e.reason)))` });
        phone.webContents.on('did-fail-load', (_ev, code, description, url, main) => { if (main) errors.push(`Load ${code}: ${description} at ${url}`); });
        stage = 'phone page load'; console.log('Mobile browser: HTTP listener ready');
        await phone.loadURL('http://127.0.0.1:15187/');
        stage = 'phone companion readiness';
        await until(() => browser('!!window.lucidRemote && !!window.__world?.lastData && !!window.__chat'), 'Phone browser did not initialize the full office.');
        check(await browser(`window.lucidRemote===true && !new URL(location.href).searchParams.has('app')`), 'production HTTP bridge boots as a companion without desktop authority');
        const snapshot = await browser('window.lucid.remoteState()');
        check(typeof snapshot.settings === 'string' && typeof snapshot.roster === 'string', 'browser bootstrap reads authoritative desktop state');
        check(await browser(`window.__world.lastData.projects[0].id==='${project.id}' && window.__world.lastData.threads[0].id==='${thread.id}' && document.querySelectorAll('.desk-unit').length>0`), 'actual office renders fixture project, robot and desk over HTTP');
        check(await browser(`document.querySelector('#app').classList.contains('mobile-layout') && document.querySelector('.scene').getBoundingClientRect().width===innerWidth`), 'production phone layout uses the full viewport');
        check(await browser(`document.querySelector('#th-list').children.length===0`), 'hidden phone sidebar defers its thread presentation');
        await capture('phone-office');
        await browser(`document.querySelector('[data-view="threads"]').click()`);
        check(await browser(`!!document.querySelector('.th-row[data-id="${thread.id}"]')`), 'opening Threads renders current data immediately without waiting for its poll');
        await until(() => browser(`!!document.querySelector('.th-row[data-id="${thread.id}"]')`), 'Fixture thread list did not render.');
        await browser(`document.querySelector('.th-row[data-id="${thread.id}"]').click()`);
        await until(() => browser(`window.__chat.threadId==='${thread.id}' && document.querySelector('.cp-list').textContent.includes('Keep this conversation')`), 'Fixture conversation did not render through the browser bridge.');
        check(await browser(`document.querySelector('#app').dataset.mobileView==='chat' && document.activeElement.tagName!=='TEXTAREA'`), 'selecting a real thread opens chat without forcing the phone keyboard');
        check(await browser(`!window.__coinRewards && !window.__lucidCompanion && document.querySelector('#orch-power-toggle').disabled`), 'phone has no duplicate coin collection or supervision owner');
        await browser(`{const t=document.querySelector('.cp-box textarea');t.value='Unsent phone draft';t.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-view="office"]').click();document.querySelector('[data-view="chat"]').click()}`);
        check(await browser(`document.querySelector('.cp-box textarea').value==='Unsent phone draft'`), 'actual chat draft survives phone surface navigation');
        await capture('phone-chat');
        await browser(`{const v=new EventTarget();Object.assign(v,{height:420,offsetTop:0,scale:1});Object.defineProperty(window,'visualViewport',{configurable:true,value:v});document.querySelector('.cp-box textarea').focus();window.dispatchEvent(new Event('resize'))}`);
        await delay(200);
        check(await browser(`{const s=document.querySelector('.cp-send').getBoundingClientRect(),n=document.querySelector('.mobile-navigation').getBoundingClientRect();s.top>=0 && s.bottom<=n.top && n.bottom<=420}`), 'actual model bar and composer remain usable above a simulated keyboard');
        await capture('phone-chat-keyboard');
        const forbidden = ['settings:save', 'roster:save', 'orch:record', 'orch:log', 'reports:tick', 'reports:submit'];
        check(!remoteCalls.some(channel => forbidden.includes(channel)), 'companion performs no shared-state or automation writes during normal use');
        check(writes === 0, 'fixture made no T3 mutations or Tailscale setup calls');
        errors.push(...await browser('window.__mobileErrors'));
        check(errors.length === 0, 'production browser reports no runtime errors');
        console.log('Mobile browser checks passed. Evidence:', out);
        clearTimeout(watchdog); clearInterval(pump); await controls.stop(); phone.destroy(); desktop.destroy(); app.quit();
      } catch (error) {
        console.error(error);
        if (phone && !phone.isDestroyed()) { console.error('Browser errors:', await browser('window.__mobileErrors').catch(() => [])); await capture('failure').catch(() => {}); }
        await controls?.stop().catch(() => {}); phone?.destroy(); desktop?.destroy(); app.exit(1);
      }
    });
  });
  require('../electron/main.cjs');
}
