// Native check that a tool window follows its real item after the scene stopped waiting (the 15 second
// timeout and the backlog early exit), and that a late update never touches a replaced or destroyed window.
// Production Director.push, WM, ToolApp and styles in an isolated Electron window. Items are fixtures shaped
// like T3 Code events; nothing is sent to T3 Code. Bounded: about 30 seconds, hard stop at 120.
// Usage: node scripts/verify-tool-view-updates-native.cjs [outDir]
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
if (!process.versions.electron) {
  (async () => {
    const out = path.resolve(process.argv[2] || 'docs/evidence/tool-view-updates-20261102');
    fs.mkdirSync(out, { recursive: true });
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-tool-updates-'));
    const root = process.cwd().replace(/\\/g, '/');
    const entry = path.join(folder, 'entry.ts');
    fs.writeFileSync(entry, [
      "import '" + root + "/node_modules/@fontsource-variable/lexend/index.css';",
      "import '" + root + "/node_modules/@fontsource-variable/jetbrains-mono/index.css';",
      ...['src/styles.css', 'src/office/office.css'].filter(p => fs.existsSync(p)).map(p => "import '" + root + '/' + p + "';"),
      ...[['WM,Cancelled', 'src/os/wm.ts'], ['Director', 'src/director.ts'], ['T3CodeApp', 'src/harness/t3code.ts'], ['ToolApp', 'src/os/apps.ts'], ['ToolViewWatch', 'src/os/tool-view.ts'], ['setRenderView', 'src/perf/render.ts']].map(([n, p]) => 'import {' + n + "} from '" + root + '/' + p + "';"),
      'window.review={WM,Cancelled,Director,T3CodeApp,ToolApp,ToolViewWatch,setRenderView};'
    ].join('\n'));
    await (await import('vite')).build({ configFile: false, logLevel: 'error', build: { outDir: folder, emptyOutDir: false, lib: { entry, name: 'Review', formats: ['iife'], fileName: () => 'test.js', cssFileName: 'test' } } });
    fs.writeFileSync(path.join(folder, 'index.html'), '<html><head><meta charset="utf-8"><link rel="stylesheet" href="test.css"><style>body{margin:0;background:#101329}#screen{position:relative;width:820px;height:461px;margin:20px}</style></head><body><div id="screen" class="screen"></div><script src="test.js"></script></body></html>');
    const env = { ...process.env, LUCID_TOOL_UPDATES: folder, LUCID_TOOL_OUT: out }; delete env.ELECTRON_RUN_AS_NODE;
    require('node:child_process').spawn(require('electron'), [__filename], { env, windowsHide: true, stdio: 'inherit' }).on('exit', c => process.exit(c || 0));
  })().catch(e => { console.error(e); process.exit(1); });
} else {
  const { app, BrowserWindow } = require('electron'), folder = process.env.LUCID_TOOL_UPDATES, out = process.env.LUCID_TOOL_OUT;
  app.setPath('userData', path.join(folder, 'profile'));
  app.commandLine.appendSwitch('disable-renderer-backgrounding'); app.commandLine.appendSwitch('disable-background-timer-throttling'); app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
  app.whenReady().then(async () => {
    const guard = setTimeout(() => { console.error('hard stop'); app.exit(2); }, 120000);
    const win = new BrowserWindow({ show: true, x: 20, y: 20, focusable: true, skipTaskbar: true, width: 900, height: 560, webPreferences: { backgroundThrottling: false } });
    const js = s => win.webContents.executeJavaScript(s), wait = ms => new Promise(r => setTimeout(r, ms));
    const results = { checks: [], errors: [], timings: {} };
    try {
      win.webContents.on('console-message', (_e, level, message) => { if (level >= 2 && !/Security Warning|Autofill|DevTools/.test(message)) results.errors.push(message); });
      await win.loadFile(path.join(folder, 'index.html'));
      await js(`(() => {
        const {WM,Cancelled,Director,T3CodeApp,ToolApp,ToolViewWatch,setRenderView}=review;
        const robot={setTyping(){},setPose(){},mouseTo(){},click(){},lookAt(){},pressKey(){},releaseKey(){}};
        const wm=new WM(document.querySelector('#screen'),robot);wm.robotName='Nimbus';wm.speed=3;
        wm.prefs={windows:'floating',launch:'dock',t3:'stable',tidiness:'tidy'};
        setRenderView(wm.root,true,820);
        const chat=new T3CodeApp(wm);chat.setInfo({id:'review',title:'Tool update review',provider:'claude',model:'claude-sonnet-5-5',projectTitle:'Lucid'});
        const director=Object.assign(Object.create(Director.prototype),{wm,chat,robot,tool:new ToolApp(wm),toolWatch:new ToolViewWatch(),items:new Map(),played:new Set(),queue:[],helperOf:new Map(),frontendSignals:new Map(),imageRefresh:{tracks:()=>false},catchingUp:false,lastEventAt:0,untilPresent:async()=>{},idleLife:{pending:false,isActive:false},stage:{say(){},setGlow(){}},onActivity(){},pump(){}});
        window.state={wm,director};window.errs=[];
        window.checks=[];window.check=(v,m)=>{if(!v)throw Error(m);window.checks.push(m)};
        const T3='mcp__t3-code__';window.T3=T3;
        window.put=(id,toolName,input,status,output)=>{director.played.add(id);director.items.set(id,{id,runId:'r',ordinal:director.items.size,type:'dynamic_tool',status,updatedAt:new Date().toISOString(),data:{toolName,input,...(output===undefined?{}:{output})}})};
        // a real update arrives through Director.push, exactly as a watch delivers it
        window.late=(id,status,output)=>{const it=structuredClone(director.items.get(id));it.status=status;if(output!==undefined)it.data.output=output;it.updatedAt=new Date(Date.now()+1).toISOString();director.push([it],false)};
        window.run=(id)=>{const t=Date.now();const p=director.play(id).then(()=>({ms:Date.now()-t})).catch(e=>{if(!(e instanceof Cancelled))window.errs.push(String(e));return {cancelled:true}});return p};
        window.body=()=>state.wm.wins.get('tool')?.body;window.text=()=>body()?.textContent||'';
        window.filler=()=>{for(const id of ['q1','q2','q3'])director.items.set(id,{id,runId:'r',ordinal:100+director.items.size,type:'assistant_message',status:'completed',updatedAt:new Date().toISOString(),data:{}});director.queue=['q1','q2','q3']};
      })()`);

      // 1. Backlog early exit: the scene stops waiting while the call still runs, then it succeeds.
      await js(`put('b1',T3+'t3_attachment_discard',{attachmentId:'pending-0ce4b802-9e93-426a-a139-5e2f0c3d4b11'},'running');filler();window.pb1=run('b1');void 0`);
      await wait(1800);
      await js(`check(body().querySelector('.tv[data-phase=pending] .tv-spin'),'backlog case starts running');check(state.director.toolWatch.size===1,'running view is registered for updates')`);
      const b1 = await js('pb1'); results.timings.backlogExitMs = b1.ms;
      await js(`state.director.queue=[];check(${b1.ms}>5900&&${b1.ms}<9500,'scene left through the backlog early exit, not on completion');check(body().querySelector('.tv[data-phase=pending] .tv-spin'),'view is still running after the scene stopped waiting');check(state.director.toolWatch.size===1,'view stays followed after the scene exit')`);
      await js(`late('b1','completed',{content:[{type:'text',text:'{"ok":true}'}]})`);
      await js(`check(body().querySelector('.tv[data-phase=done]')&&!body().querySelector('.tv-spin')&&/Upload discarded/.test(text()),'late success repaints with no play call');check(state.director.toolWatch.size===0,'settled view is released')`);

      // 2. The 15 second timeout: the scene gives up, then the call fails with a reason.
      await js(`put('t1',T3+'t3_attachment_discard',{attachmentId:'pending-77aa1c20-3b1f-4d5e-9c01-6a2f9d0e8b34'},'running');window.pt1=run('t1');void 0`);
      const t1 = await js('pt1'); results.timings.timeoutExitMs = t1.ms;
      await js(`check(${t1.ms}>14900&&${t1.ms}<18500,'scene left through the 15 second timeout');check(body().querySelector('.tv[data-phase=pending]')&&/Discarding upload/.test(text()),'view is still running after the timeout');check(state.director.toolWatch.size===1,'timed out view stays followed')`);
      await js(`late('t1','failed',{isError:true,content:[{type:'text',text:'This upload was already sent with a message, so it cannot be discarded.'}]})`);
      await wait(350);
      await js(`{const r=body().firstElementChild;check(r.dataset.phase==='failed'&&/could not be discarded/.test(text())&&/already sent/.test(text()),'late failure shows the tool reason');check(r.scrollHeight<=r.clientHeight+1,'window grew to hold the late reason');check(!body().querySelector('.tv-spin'),'no arc after failure');check(state.director.toolWatch.size===0,'failed view is released')}`);

      // 3. Replacement: another call takes the window, then the older call settles.
      await js(`put('c1',T3+'t3_attachment_discard',{attachmentId:'pending-c1c1c1c1-0000-4000-8000-000000000001'},'running');window.pc1=run('c1');void 0`);
      await wait(1500);
      await js(`put('c2','mcp__weather__get_forecast',{city:'Berlin'},'running');window.pc2=run('c2');void 0`);
      await wait(1500);
      await js(`check(document.querySelector('.app-tool .win-title').textContent==='Weather'&&/Get forecast/.test(text()),'second call replaced the window content')`);
      const watched = await js('state.director.toolWatch.size');
      if (watched !== 1) throw Error('replaced view was not pruned when the newer call registered');
      await js(`late('c1','completed',{content:[{type:'text',text:'ok'}]})`);
      await wait(400);
      await js(`check(document.querySelector('.app-tool .win-title').textContent==='Weather'&&/Get forecast/.test(text())&&!/Upload discarded/.test(text()),'older call result did not overwrite the newer call');check(body().querySelector('.tv[data-phase=pending]'),'newer call still shows its own running state');check(state.director.toolWatch.size===1,'only the newer view is still followed')`);
      await js('pc1');
      await js(`late('c2','completed',{content:[{type:'text',text:'Sunny, 21 degrees.'}]})`);
      await js(`check(body().querySelector('.tv[data-phase=done]')&&/Sunny, 21 degrees/.test(text()),'newer call still follows its own outcome');`);
      await js('pc2');

      // 4. Destruction: the window is gone, then the call settles; later content is untouched.
      await js(`put('e1',T3+'t3_attachment_discard',{attachmentId:'pending-e1e1e1e1-0000-4000-8000-000000000002'},'running');window.pe1=run('e1');void 0`);
      await wait(1500);
      await js(`state.wm.reset()`);
      await js('pe1');
      await js(`check(state.wm.wins.size===0,'window destroyed');late('e1','completed',{content:[{type:'text',text:'ok'}]});check(state.wm.wins.size===0,'late result does not reopen or repaint a destroyed window');check(state.director.toolWatch.size===0,'destroyed view is released')`);
      await js(`put('f1',T3+'t3_attachment_discard',{attachmentId:'pending-f1f1f1f1-0000-4000-8000-000000000003'},'running');window.pf1=run('f1');void 0`);
      await wait(1500);
      await js(`late('e1','failed',{isError:true,content:[{type:'text',text:'stale failure'}]});check(body().querySelector('.tv[data-phase=pending]')&&!/stale failure/.test(text()),'stale result does not leak into a later window')`);
      await js(`late('f1','completed',{content:[{type:'text',text:'ok'}]})`); await js('pf1');
      await js(`check(body().querySelector('.tv[data-phase=done]'),'later window follows its own outcome')`);

      results.checks = await js('window.checks'); results.errors.push(...await js('window.errs'));
      results.passed = !results.errors.length;
    } catch (error) { results.error = String(error); results.checks = await js('window.checks').catch(() => []); }
    clearTimeout(guard);
    fs.writeFileSync(path.join(out, 'update-results.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify({ passed: results.passed, error: results.error, checks: results.checks?.length, errors: results.errors, timings: results.timings }));
    app.exit(results.passed ? 0 : 1);
  });
}
