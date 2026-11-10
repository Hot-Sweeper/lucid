// Bounded native fixture using production Desk, robot, Director and Notes.
// Never connects to T3 or launches/restarts the installed application.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const out = path.resolve('docs/evidence/thought-bubble-review-20261101');
if (!process.versions.electron) {
  (async () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-thought-review-'));
    const root = process.cwd().replaceAll('\\', '/');
    const before = require('../../electron/build-state.cjs').snapshot(process.cwd());
    const entry = path.join(folder, 'entry.ts');
    fs.writeFileSync(entry, `import '${root}/node_modules/@fontsource-variable/lexend/index.css';
import '${root}/node_modules/@fontsource-variable/jetbrains-mono/index.css';
import '${root}/src/styles.css';import '${root}/src/office/office.css';import '${root}/src/world/world.css';
import {Desk} from '${root}/src/office/desk.ts';
import {setRenderView} from '${root}/src/perf/render.ts';window.review={Desk,setRenderView};`);
    await (await import('vite')).build({ configFile: false, logLevel: 'error', build: { outDir: folder, emptyOutDir: false, lib: { entry, name: 'Review', formats: ['iife'], fileName: () => 'test.js', cssFileName: 'test' } } });
    if (require('../../electron/build-state.cjs').changed(before, require('../../electron/build-state.cjs').snapshot(process.cwd())).length) throw Error('Source changed during native fixture build');
    fs.writeFileSync(path.join(folder, 'index.html'), '<html><head><meta charset="utf-8"><link rel="stylesheet" href="test.css"><style>body{background:#b59c86}#desk{position:relative;margin:16px 40px}.desk-unit{transform:scale(2.3);transform-origin:top left}</style></head><body><div id="desk"></div><script src="test.js"></script></body></html>');
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'tested-source.json'), JSON.stringify({ at: new Date().toISOString(), sources: before, bundleSha256: hash(path.join(folder, 'test.js')), isolatedProfile: path.join(folder, 'profile'), productionRestarted: false }, null, 2));
    const env = { ...process.env, LUCID_THOUGHT_FIXTURE: folder }; delete env.ELECTRON_RUN_AS_NODE;
    require('node:child_process').spawn(require('electron'), [__filename], { env, windowsHide: true, stdio: 'inherit' }).on('exit', c => process.exit(c ?? 1));
  })().catch(error => { console.error(error); process.exitCode = 1; });
} else {
  const { app, BrowserWindow } = require('electron'), folder = process.env.LUCID_THOUGHT_FIXTURE;
  app.setPath('userData', path.join(folder, 'profile'));
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ show: true, width: 1160, height: 950, webPreferences: { backgroundThrottling: false } });
    win.webContents.on('console-message', (_e, ...args) => console.log('fixture', ...args));
    const timeout = setTimeout(() => { console.error('Native thought review exceeded 30 seconds'); app.exit(1); }, 30000);
    const js = code => win.webContents.executeJavaScript(code), wait = ms => new Promise(r => setTimeout(r, ms));
    const shot = async name => fs.writeFileSync(path.join(out, name + '.png'), (await win.webContents.capturePage()).toPNG());
    try {
      await win.loadFile(path.join(folder, 'index.html'));
      await js(`(()=>{
        const {Desk,setRenderView}=review;
        const desk=window.desk=new Desk(document.querySelector('#desk'),0,0,{peek:async()=>null,image:async()=>null,readText:async()=>null});
        desk.assign({id:'isolated-thought',title:'Streamed Notes review',provider:'claudeAgent',model:'Opus 5.5'});
        desk.wm.prefs={...desk.wm.prefs,launch:'dock',windows:'floating'};desk.wm.speed=2;
        desk.setSeated(true);setRenderView(desk.el,true,920);setRenderView(desk.screen,true,820);setRenderView(desk.wm.root,true,820);
        window.keys=0;window.speech=[];const key=desk.robot.pressKey.bind(desk.robot);desk.robot.pressKey=k=>{keys++;key(k)};
        const say=desk.say.bind(desk);desk.say=(text,kind)=>{if(text)speech.push({text,kind});say(text,kind)};
        const d=desk.director;d.info={id:'isolated-thought',run:{status:'running'}};
        const item={id:'thought',type:'reasoning',status:'running',data:{text:'I am checking how the outdoor layer covers the camera while the office moves.'}};
        d.items.set(item.id,item);window.item=item;window.playDone=false;
        d.play(item.id).then(()=>playDone=true);window.signature=()=>({keys,text:desk.wm.wins.get('notes')?.body.querySelector('.notes')?.textContent||'',bubble:desk.bubble.classList.contains('show'),speech:speech.length});
      })()`);
      for (let n = 0; n < 100; n++) { if (await js(`signature().text.length>8&&keys>3`)) break; await wait(60); }
      await wait(1500);
      const first = await js('signature()');
      if (!first.text || !first.keys || first.bubble || first.speech) throw Error('Initial Notes typing or bubble suppression failed');
      await shot('after-streaming-notes');
      await js(`item.data.text+=${JSON.stringify('\n\nNext I am preserving the full detail and checking the neighboring office bounds. The notes keep updating as the streamed thought grows. I am retaining the same artwork and measuring the visible camera geometry before adjusting the landscape. This thought continues in the notebook without covering the robot or the desk.')}`);
      await wait(800); const second = await js('signature()');
      if (second.keys <= first.keys || second.text.length <= first.text.length || second.bubble || second.speech) throw Error('Stream growth stopped typing or produced a duplicate bubble');
      await shot('after-stream-growth');
      await js(`item.status='completed';item.data.streaming=false`);
      for (let n = 0; n < 100; n++) { if (await js('playDone')) break; await wait(60); }
      const final = await js('signature()');
      if (!await js('playDone') || final.bubble || final.speech) throw Error('Reasoning completion failed');
      await js(`(()=>{const d=desk.director;d.items.set('question',{id:'question',type:'user_input_request',status:'running',data:{questions:[{question:'Which project should I use?'}]}});window.resolveQuestion=null;d.settle=()=>new Promise(r=>resolveQuestion=r);d.messages.note=async()=>{};d.play('question');})()`);
      await wait(700); const question = await js(`({visible:desk.bubble.classList.contains('show'),kind:desk.bubble.className,text:desk.bubble.textContent})`);
      if (!question.visible || !question.kind.includes('speak') || !question.text.includes('Which project')) throw Error('Genuine question bubble was not preserved');
      await shot('question-preserved');
      await js(`resolveQuestion({data:{}})`); await wait(350);
      await js(`desk.say('Your task is ready for review.','speak')`); await wait(600);
      const speech = await js(`({visible:desk.bubble.classList.contains('show'),kind:desk.bubble.className,text:desk.bubble.textContent})`);
      if (!speech.visible || !speech.kind.includes('speak')) throw Error('Speech bubble was not preserved');
      await shot('speech-preserved');
      await js('desk.destroy()');
      fs.writeFileSync(path.join(out, 'native-results.json'), JSON.stringify({ passed: true, scope: 'Isolated production components with supplied deterministic stream, not a live T3 job', first, second, final, question, speech, productionRestarted: false }, null, 2));
      console.log('PASS: native streamed Notes grow, real key events continue, no overhead thought duplicates, genuine question and speech bubbles retained.');
      clearTimeout(timeout); win.destroy(); app.exit(0);
    } catch (error) { console.error(error); clearTimeout(timeout); win.destroy(); app.exit(1); }
  });
}
