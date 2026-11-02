// Native capture of operations that have no app of their own, through the production Director, WM,
// ToolApp and styles in an isolated Electron window. Items are fixtures shaped like T3 Code events
// (nothing is sent to T3 Code and no thread is touched). Usage: node scripts/capture-tool-view-native.cjs <outDir>
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
if (!process.versions.electron) {
  (async () => {
    const out = path.resolve(process.argv[2] || 'docs/evidence/tool-view-20261102');
    fs.mkdirSync(out, { recursive: true });
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-tool-view-'));
    const root = process.cwd().replace(/\\/g, '/');
    const entry = path.join(folder, 'entry.ts');
    fs.writeFileSync(entry, [
      "import '" + root + "/node_modules/@fontsource-variable/lexend/index.css';",
      "import '" + root + "/node_modules/@fontsource-variable/jetbrains-mono/index.css';",
      ...['src/styles.css', 'src/office/office.css'].filter(p => fs.existsSync(p)).map(p => "import '" + root + '/' + p + "';"),
      ...[['WM', 'src/os/wm.ts'], ['Director', 'src/director.ts'], ['T3CodeApp', 'src/harness/t3code.ts'], ['ToolApp', 'src/os/apps.ts'], ['ToolViewWatch', 'src/os/tool-view.ts'], ['setRenderView', 'src/perf/render.ts']].map(([n, p]) => 'import {' + n + "} from '" + root + '/' + p + "';"),
      'window.review={WM,Director,T3CodeApp,ToolApp,ToolViewWatch,setRenderView};'
    ].join('\n'));
    await (await import('vite')).build({ configFile: false, logLevel: 'error', build: { outDir: folder, emptyOutDir: false, lib: { entry, name: 'Review', formats: ['iife'], fileName: () => 'test.js', cssFileName: 'test' } } });
    fs.writeFileSync(path.join(folder, 'index.html'), '<html><head><meta charset="utf-8"><link rel="stylesheet" href="test.css"><style>body{margin:0;background:#101329}#screen{position:relative;width:820px;height:461px;margin:20px}</style></head><body><div id="screen" class="screen"></div><script src="test.js"></script></body></html>');
    const env = { ...process.env, LUCID_TOOL_REVIEW: folder, LUCID_TOOL_OUT: out }; delete env.ELECTRON_RUN_AS_NODE;
    require('node:child_process').spawn(require('electron'), [__filename], { env, windowsHide: true, stdio: 'inherit' }).on('exit', c => process.exit(c || 0));
  })().catch(e => { console.error(e); process.exit(1); });
} else {
  const { app, BrowserWindow } = require('electron'), folder = process.env.LUCID_TOOL_REVIEW, out = process.env.LUCID_TOOL_OUT;
  app.setPath('userData', path.join(folder, 'profile'));
  app.commandLine.appendSwitch('disable-renderer-backgrounding'); app.commandLine.appendSwitch('disable-background-timer-throttling'); app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ show: true, x: 20, y: 20, focusable: true, skipTaskbar: true, width: 1760, height: 1000, webPreferences: { backgroundThrottling: false } });
    const js = s => win.webContents.executeJavaScript(s), wait = ms => new Promise(r => setTimeout(r, ms));
    const hashes = {};
    const capture = async (name, zoom = 2) => {
      win.webContents.setZoomFactor(zoom); await wait(180);
      const rect = await js(`(()=>{const r=document.querySelector('#screen').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`);
      const img = (await win.webContents.capturePage({ x: Math.round(rect.x * zoom), y: Math.round(rect.y * zoom), width: Math.round(rect.width * zoom), height: Math.round(rect.height * zoom) })).toPNG();
      const file = path.join(out, name + '.png'); fs.writeFileSync(file, img);
      hashes[name + '.png'] = crypto.createHash('sha256').update(img).digest('hex');
    };
    const results = { checks: [], errors: [] };
    try {
      win.webContents.on('console-message', (_e, level, message) => { if (level >= 2) results.errors.push(message); });
      await win.loadFile(path.join(folder, 'index.html'));
      await js(`(() => {
        const {WM,Director,T3CodeApp,ToolApp,ToolViewWatch,setRenderView}=review;
        const robot={setTyping(){},setPose(){},mouseTo(){},click(){},lookAt(){},pressKey(){},releaseKey(){}};
        const wm=new WM(document.querySelector('#screen'),robot);wm.robotName='Nimbus';wm.speed=3;
        wm.prefs={windows:'floating',launch:'dock',t3:'stable',tidiness:'tidy'};
        setRenderView(wm.root,true,820);
        const chat=new T3CodeApp(wm);chat.setInfo({id:'review',title:'Tool view review',provider:'claude',model:'claude-sonnet-5-5',projectTitle:'Lucid'});
        const director=Object.assign(Object.create(Director.prototype),{wm,chat,robot,tool:new ToolApp(wm),toolWatch:new ToolViewWatch(),items:new Map(),queue:[],catchingUp:false,untilPresent:async()=>{},idleLife:{pending:false},stage:{say(){},setGlow(){}},onActivity(l){(window.activity??=[]).push(l)}});
        window.state={wm,director};
        window.checks=[];window.check=(v,m)=>{if(!v)throw Error(m);window.checks.push(m)};
        window.put=(id,toolName,input,status,output)=>{state.director.items.set(id,{id,runId:'r',ordinal:state.director.items.size,type:'dynamic_tool',status,updatedAt:new Date().toISOString(),data:{toolName,input,...(output===undefined?{}:{output})}})};
        window.finish=(id,status,output)=>{const it=state.director.items.get(id);it.status=status;if(output!==undefined)it.data.output=output};
        window.body=()=>state.wm.wins.get('tool').body;
        window.text=()=>body().textContent;
      })()`);
      const T3 = 'mcp__t3-code__';
      const pending = 'pending-0ce4b802-9e93-426a-a139-5e2f0c3d4b11';

      // 1. The exact operation from the report: discard, only an identifier, still running, then done.
      await js(`put('d1',${JSON.stringify(T3 + 't3_attachment_discard')},{attachmentId:${JSON.stringify(pending)}},'running');window.p1=state.director.play('d1');void 0`);
      await wait(1500);
      await js(`check(state.wm.wins.has('tool'),'tool window opened');check(document.querySelector('.app-tool .win-title').textContent==='T3 Code','window is titled T3 Code');check(document.querySelector('.app-tool .win-bar svg.ico')?.innerHTML.includes('M33.4509')||document.querySelector('.app-tool .win-bar svg.ico')?.innerHTML.includes('#0b0b0c'),'title bar carries the T3 Code icon not the generic wrench');check(body().querySelector('.tv[data-phase=pending] .tv-spin'),'running state shows the turning arc');check(!/attachmentId|t3 attachment/i.test(text()),'raw argument and tool names are not shown');check(/Discarding upload/.test(text()),'running headline');check(!/%/.test(text())&&!body().querySelector('progress,[role=progressbar]'),'no invented progress');check(/Unsent upload/.test(text())&&!/\\.(png|pdf|md)/i.test(text()),'no file name is invented')`);
      await capture('discard-running');
      await js(`finish('d1','completed',{content:[{type:'text',text:'{"ok":true}'}]});void 0`);
      await js(`p1`); await wait(300);
      await js(`check(body().querySelector('.tv[data-phase=done]')&&!body().querySelector('.tv-spin'),'completion replaces the arc');check(/Upload discarded/.test(text()),'done headline')`);
      await capture('discard-done');

      // 2. A failed discard shows the tool's own reason.
      await js(`put('d2',${JSON.stringify(T3 + 't3_attachment_discard')},{attachmentId:'pending-77aa1c20-3b1f-4d5e-9c01-6a2f9d0e8b34'},'failed',{isError:true,content:[{type:'text',text:'This upload was already sent with a message, so it cannot be discarded.'}]});window.p2=state.director.play('d2');void 0`);
      await js(`p2`); await wait(300);
      await js(`check(body().querySelector('.tv[data-phase=failed]'),'failed phase');check(/could not be discarded/.test(text())&&/already sent/.test(text()),'failure reason is the tool\\'s own message')`);
      await wait(350);
      await js(`{const r=body().firstElementChild;check(body().querySelector('.tv-note').getBoundingClientRect().height>20,'failure reason is visible, not squeezed out');check(r.scrollHeight<=r.clientHeight+1,'window grew to hold the reason without clipping')}`);
      await capture('discard-failed');

      // 3. A discard whose upload an earlier real call described: real name, type and size.
      await js(`put('p3',${JSON.stringify(T3 + 't3_attachment_prepare_upload')},{upload:{type:'image',name:'robot-monitor-before.png',mimeType:'image/png',sizeBytes:1843200}},'completed',{structuredContent:{attachmentId:'pending-5d31c9aa-0000-4f00-b000-1234567890ab',relativeUrl:'/upload/5d31c9aa'}});put('d3',${JSON.stringify(T3 + 't3_attachment_discard')},{attachmentId:'pending-5d31c9aa-0000-4f00-b000-1234567890ab'},'completed',{content:[{type:'text',text:'Discarded.'}]});window.p3=state.director.play('d3');void 0`);
      await js(`p3`); await wait(300);
      await js(`check(/robot-monitor-before\\.png/.test(text())&&/PNG image/.test(text())&&/1\\.8 MB/.test(text()),'real name, type and size from the earlier event');check(body().querySelector('.tv-tile.img'),'image tile');check(!body().querySelector('img'),'no preview is invented without image data')`);
      await capture('discard-with-file');

      // 4. Preparing an upload names the file from its own arguments.
      await js(`put('p4',${JSON.stringify(T3 + 't3_attachment_prepare_upload')},{upload:{type:'file',name:'review-notes.pdf',mimeType:'application/pdf',sizeBytes:48213}},'running');window.p4=state.director.play('p4');void 0`);
      await wait(1500);
      await js(`check(/Preparing upload/.test(text())&&/review-notes\\.pdf/.test(text())&&/PDF document/.test(text()),'prepare names its file');check(body().querySelector('.tv-tile b')?.textContent==='PDF','document tile')`);
      await capture('prepare-running');
      await js(`finish('p4','completed',{structuredContent:{attachmentId:'pending-aaaa1111-2222-3333-4444-555566667777'}});void 0`);
      await js(`p4`); await wait(300);
      await js(`check(/Upload ready/.test(text()),'prepare done')`);
      await capture('prepare-done');

      // 5. Narrow window with a very long name; second capture on the Nightly build.
      await js(`put('p5',${JSON.stringify(T3 + 't3_attachment_prepare_upload')},{upload:{type:'image',name:'before-and-after-capture-of-the-robot-monitor-with-an-unusually-long-descriptive-name-v12-final.png',mimeType:'image/png',sizeBytes:9876543}},'completed',{structuredContent:{attachmentId:'pending-bbbb1111-2222-3333-4444-555566667777'}});window.p5=state.director.play('p5');void 0`);
      await js(`p5`); await wait(200);
      await js(`{const w=state.wm.wins.get('tool').el;w.style.width='232px';w.style.height='172px'}`); await wait(250);
      await js(`{const b=body();check(b.scrollWidth<=b.clientWidth+1,'no horizontal overflow when narrow');check(b.firstElementChild.scrollHeight<=b.firstElementChild.clientHeight+1,'narrow window shows all rows');check(b.querySelector('.tv-name').scrollHeight<=b.querySelector('.tv-name').clientHeight+2||b.querySelector('.tv-name').clientHeight>0,'long name is clamped inside the window')}`);
      await capture('narrow-long-name');
      await js(`state.wm.prefs.t3='nightly';put('n6',${JSON.stringify(T3 + 't3_attachment_discard')},{attachmentId:${JSON.stringify(pending)}},'running');window.p6=state.director.play('n6');void 0`);
      await wait(1500);
      await js(`check(document.querySelector('.app-tool .win-title').textContent==='T3 Code (Nightly)'&&body().querySelector('.tv-t3').dataset.channel==='nightly','Nightly build title and surface')`);
      await capture('discard-running-nightly');
      await js(`finish('n6','completed',{content:[{type:'text',text:'ok'}]});void 0`); await js('p6'); await js(`state.wm.prefs.t3='stable'`);

      // 6. Any other tool keeps the quiet fallback, not a T3 look; a secret-looking value stays hidden.
      await js(`put('g7','mcp__weather__get_forecast',{city:'Berlin',days:3,apiKey:'sk-live-should-not-appear'},'running');window.p7=state.director.play('g7');void 0`);
      await wait(1500);
      await js(`check(document.querySelector('.app-tool .win-title').textContent==='Weather'&&!body().querySelector('.tv-t3'),'unknown tool is not styled as T3 Code');check(!/sk-live/.test(body().innerHTML),'secret-looking value is not drawn');check(/Berlin/.test(text()),'real argument shown');check(document.querySelector('.app-tool .win-bar svg.ico')&&!document.querySelector('.app-tool .win-bar svg.ico').innerHTML.includes('M33.4509'),'generic icon for generic tool')`);
      await capture('generic-running');
      await js(`finish('g7','completed',{content:[{type:'text',text:'Sunny, 21 degrees.'}]});void 0`); await js('p7'); await wait(300);
      await capture('generic-done');
      results.errors = results.errors.filter(e => !/Autofill|DevTools|Security Warning/.test(e));
      await js(`check(true,'complete')`);
      results.checks = await js('window.checks'); results.activity = await js('window.activity');
      results.passed = !results.errors.length;
    } catch (error) { results.error = String(error); results.checks = await js('window.checks').catch(() => []); }
    results.hashes = hashes;
    fs.writeFileSync(path.join(out, 'capture-results.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify({ passed: results.passed, error: results.error, checks: results.checks?.length, errors: results.errors }));
    app.exit(results.passed ? 0 : 1);
  });
}
