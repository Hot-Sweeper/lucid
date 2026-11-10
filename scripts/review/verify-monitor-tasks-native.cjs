const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const root = path.resolve(__dirname, '../..'), out = process.env.LUCID_MONITOR_TASK_REVIEW || path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-monitor-tasks-')));
if (!process.versions.electron) {
  (async () => {
    fs.mkdirSync(out, { recursive: true }); const src = root.replaceAll('\\', '/'), entry = path.join(out, 'entry.ts');
    fs.writeFileSync(entry, `import {Desk} from ${JSON.stringify(src+'/src/office/desk.ts')};import {MonitorTasks} from ${JSON.stringify(src+'/src/office/monitor-tasks.ts')};import {setScreenDetail} from ${JSON.stringify(src+'/src/perf/screen-detail.ts')};import {gameSound} from ${JSON.stringify(src+'/src/office/sound.ts')};import ${JSON.stringify(src+'/src/styles.css')};import ${JSON.stringify(src+'/src/office/office.css')};gameSound.configure(false,0);window.review={Desk,MonitorTasks,setScreenDetail};`);
    await (await import('vite')).build({ configFile:false,logLevel:'error',build:{outDir:out,emptyOutDir:false,lib:{entry,name:'Review',formats:['iife'],fileName:()=> 'fixture.js',cssFileName:'fixture'}}});
    const csp = fs.readFileSync(path.join(root,'index.html'),'utf8').match(/<meta http-equiv="Content-Security-Policy"[^>]+>/)[0];
    fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><html><head>${csp}<link rel="stylesheet" href="fixture.css"><style>body{margin:0;background:#b99a75;padding:18px}#host{position:relative;width:820px;height:461px}.desk-unit{left:0!important;top:0!important;width:820px;height:461px}.monitor{left:0!important;top:0!important;width:820px;height:461px}.monitor .screen{left:0!important;top:0!important;transform:none!important}.desk-unit>:not(.monitor){display:none!important}</style></head><body><div id="host"></div><script src="fixture.js"></script></body></html>`);
    const env = {...process.env,LUCID_MONITOR_TASK_REVIEW:out};delete env.ELECTRON_RUN_AS_NODE;
    require('node:child_process').spawn(require('electron'),[__filename],{env,windowsHide:true,stdio:'inherit'}).on('exit',code=>process.exit(code??1));
  })().catch(e=>{console.error(e);process.exitCode=1;});
} else {
  const {app,BrowserWindow}=require('electron');app.setPath('userData',path.join(out,'profile'));
  app.whenReady().then(async()=>{
    const win=new BrowserWindow({show:false,width:872,height:560,webPreferences:{sandbox:true,offscreen:true,backgroundThrottling:false}}),result={checks:[],errors:[],screenshots:[],source:{}};
    const hash=p=>require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
    for(const p of ['src/office/answer.ts','src/office/monitor-tasks.ts','src/office/monitor-tasks.css','src/office/coin-rewards.ts','src/office/room-policy.ts','src/office/world.ts','src/os/wm.ts','src/main.ts'])result.source[p]=hash(p);
    const deadline=setTimeout(()=>{result.errors.push('deadline');fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));app.exit(1)},25000);
    const run=code=>win.webContents.executeJavaScript(code);
    const capture=async name=>{await new Promise(r=>setTimeout(r,140));fs.writeFileSync(path.join(out,name),(await win.webContents.capturePage()).toPNG());result.screenshots.push(name)};
    try {
      await win.loadFile(path.join(out,'index.html'));
      await run(`(()=>{
        const {Desk,MonitorTasks}=review,d=new Desk(document.getElementById('host'),0,0,{peek:async()=>null,image:async()=>null,readText:async()=>null});d.threadId='a';d.el.classList.remove('empty');
        const t={id:'a',title:'Build the feature',updatedAt:'one',runStatus:'running',question:null,settled:false,pinned:false,provider:'codex',projectId:'p',model:null};
        const world={desks:new Map([['a',d]]),lastData:{threads:[t],projects:[]},setCompletionHolds(ids){this.holds=[...ids]},update(data){this.lastData=data}},state={pending:[],calls:[],fail:false,reward:'2.50',collected:0,closed:0};
        const actions={answer:{pending:async()=>structuredClone(state.pending),t3:{status:async()=>({paired:true,error:null}),respond:async p=>{state.calls.push(p);if(state.fail)throw Error('Connection lost');state.pending=[]}}},read:()=>{state.read=true},close:()=>{state.closed++},reward:()=>state.reward,collect:()=>{if(state.reward){state.collected++;state.reward=null}}};
        const manager=new MonitorTasks(world,actions);manager.prepare(world.lastData);window.f={d,t,world,state,manager,actions};window.check=(v,m)=>{if(!v)throw Error(m)};
      })()`);
      await capture('before-task-event.png');
      const initial = await run(`(async()=>{
        const {t,state,manager}=f;t.question='Choose a release';state.pending=[{id:'question-1',type:'input',at:'now',answerable:true,reason:null,questions:[{id:'release',header:'Release',question:'Which release should I prepare?',options:[{label:'Stable',value:'stable',description:'Use the tested version'},{label:'Preview',value:'preview',description:'Try the new version'}],multiSelect:false,allowCustomAnswer:true,initialAnswer:null},{id:'checks',header:'Checks',question:'Which checks should I run?',options:[{label:'Typecheck',value:'types',description:''},{label:'Build',value:'build',description:''}],multiSelect:true,allowCustomAnswer:true,initialAnswer:null}]}];
        const active=document.activeElement;manager.sync();await new Promise(r=>setTimeout(r,30));const panel=document.querySelector('.monitor-task-panel');
        const underlying=document.createElement('div');underlying.className='win';underlying.style.cssText='left:0;top:0;width:300px;height:200px;z-index:1';f.d.wm.layer.append(underlying);f.d.wm.wins.set('notes',{id:'notes',el:underlying,body:underlying,title:underlying,lastUsed:0});f.d.wm.setOverlayCovered(false);f.d.wm.setOverlayCovered(true);check(underlying.dataset.renderHidden==='1','Covered app rendering remained active');f.underlying=underlying;
        check(panel.textContent.includes('Which release should I prepare?'),'Question text missing');check(panel.querySelectorAll('input[type=radio]').length===3&&panel.querySelectorAll('input[type=checkbox]').length===3,'Wrong selectors');check(document.activeElement===active,'New monitor stole keyboard focus');
        const form=panel.querySelector('form');form.querySelector('input[value=stable]').checked=true;form.querySelector('input[value=types]').checked=true;form.querySelector('input[value=build]').checked=true;f.form=form;return ['Real question, single/multiple selectors and custom answer controls render on the actual monitor','Incoming question does not steal focus'];
      })()`);result.checks.push(...initial);await capture('after-question.png');
      result.checks.push(...await run(`(async()=>{
        const form=f.form,input=form.querySelector('input[value=stable]');review.setScreenDetail(f.d.wm.root,true,200,820);await new Promise(r=>setTimeout(r,200));
        check(f.d.wm.root.dataset.screenDetail==='shapes'&&getComputedStyle(form).visibility==='hidden','Question glyphs leaked through distance simplification');
        review.setScreenDetail(f.d.wm.root,true,820,820);await new Promise(r=>setTimeout(r,30));check(f.form===form&&input.checked&&getComputedStyle(form).visibility==='visible','Zoom reset answers');
        return ['Question monitor uses the shared distance simplification and restores the same selected form'];
      })()`));
      result.checks.push(...await run(`(async()=>{
        f.state.fail=true;f.form.requestSubmit();await new Promise(r=>setTimeout(r,20));check(f.form.querySelector('.ca-state').textContent.includes('Connection lost'),'Failure not shown');check(f.form.querySelector('input[value=stable]').checked,'Answer lost after failure');
        f.state.fail=false;f.form.requestSubmit();f.form.requestSubmit();await new Promise(r=>setTimeout(r,40));check(f.state.calls.length===2,'Duplicate submit');const sent=f.state.calls[1];check(sent.threadId==='a'&&sent.requestId==='question-1'&&sent.answers.release==='stable'&&sent.answers.checks.join(',')==='types,build','Incorrect T3 response payload');
        f.state.pending=[{id:'typed',type:'input',at:'now',answerable:true,reason:null,questions:[{id:'words',header:'Details',question:'What should I change?',options:[],multiSelect:false,allowCustomAnswer:true,initialAnswer:null}]}];f.manager.sync();await new Promise(r=>setTimeout(r,30));
        const typed=document.querySelector('.monitor-task-panel textarea');typed.value='Bitte die Größe ändern';typed.dispatchEvent(new Event('input',{bubbles:true}));typed.closest('form').requestSubmit();await new Promise(r=>setTimeout(r,30));check(f.state.calls.at(-1).answers.words==='Bitte die Größe ändern','Free text was changed');
        f.t.question=null;f.manager.sync();check(!document.querySelector('.monitor-task-panel'),'Resolved question did not restore desktop');check(f.underlying.dataset.renderHidden==='0','Underlying app did not resume');
        f.t.runStatus='completed';f.t.updatedAt='two';f.manager.prepare(f.world.lastData);f.manager.sync();check(f.world.holds.includes('a'),'Completed monitor was not retained');check(document.querySelector('.monitor-task-panel').textContent.includes('Work complete'),'Missing completion');
        return ['Failed request preserves selected answers and provides retry','Single/multiple answer payload targets the exact T3 request, with duplicate submit blocked','Typed Unicode answer is sent unchanged through the same question form','Resolved question restores the existing desktop','Covered app cosmetics suspend and resume through existing WM occlusion','Real completion retains the monitor and shows Done controls'];
      })()`));await capture('after-complete.png');
      result.checks.push(...await run(`(()=>{
        const panel=document.querySelector('.monitor-task-panel'),collect=panel.querySelector('[data-task-collect]');check(collect.textContent==='Collect 2.50 coins','Wrong reward');collect.click();collect.click();check(f.state.collected===1,'Coins duplicated');check(panel.querySelector('[data-task-collect]').hidden,'Collected coins remain visible');panel.querySelector('[data-task-close]').click();f.manager.sync();check(!document.querySelector('.monitor-task-panel')&&f.state.closed===1&&!f.world.holds.length,'Close did not release completion');check(!f.t.settled,'Closing silently settled the T3 thread');
        f.t.updatedAt='metadata-change';f.manager.sync();check(!document.querySelector('.monitor-task-panel'),'Metadata refresh reopened a dismissed completion');
        f.t.runStatus='running';f.manager.prepare(f.world.lastData);f.manager.sync();check(!document.querySelector('.monitor-task-panel'),'New work has stale completion');
        f.t.question='Permission';f.state.pending=[{id:'approval',type:'approval',at:'now',answerable:true,reason:null,requestKind:'command',prompt:'npm run build',detail:'Build locally',options:[{decision:'decline',label:'Deny',warning:null},{decision:'accept',label:'Approve',warning:null}]}];f.manager.sync();
        return ['Coin collection uses the existing reward action and cannot duplicate a payout','Close screen releases the desk without settling/deleting the T3 thread','Metadata refresh does not reopen a dismissed completion','New work clears stale completion'];
      })()`));
      await new Promise(r=>setTimeout(r,40));
      result.checks.push(...await run(`(async()=>{
        const panel=document.querySelector('.monitor-task-panel');check(panel.querySelector('button[value=decline]'),'Approval controls missing');panel.querySelector('button[value=decline]').click();await new Promise(r=>setTimeout(r,30));check(f.state.calls.at(-1).decision==='decline','Approval did not use exact explicit choice');
        f.t.question=null;f.manager.sync();let release;f.actions.answer.pending=()=>new Promise(r=>release=r);f.t.question='Late question';f.manager.sync();await Promise.resolve();f.manager.destroy();release([]);await new Promise(r=>setTimeout(r,20));check(!document.querySelector('.monitor-task-panel'),'Late response restored destroyed monitor');
        return ['Approval requires the explicit decision button and uses the existing T3 response path','Disposal removes overlays and ignores late pending reads'];
      })()`));
      result.ok=true;clearTimeout(deadline);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));app.exit(0);
    }catch(e){result.errors.push(String(e.stack||e));clearTimeout(deadline);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.error(e);app.exit(1)}
  });
}
