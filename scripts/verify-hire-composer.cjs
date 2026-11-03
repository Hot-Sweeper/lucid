const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
if (!process.versions.electron) {
  (async () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-hire-composer-'));
    const entry = path.join(folder, 'entry.ts');
    const root = process.cwd().replace(/\\/g, '/');
    fs.writeFileSync(entry, `import '${root}/node_modules/@fontsource-variable/lexend/index.css';\nimport '${root}/src/styles.css';\nimport '${root}/src/office/office.css';\nimport '${root}/src/office/panels.css';\nimport '${root}/src/world/world.css';\nimport {openHire, matchingWorkers, BUILTIN_ROLES} from '${root}/src/office/hire.ts';\nimport {Roster} from '${root}/src/office/roster.ts';\nimport {randomLook,seeded} from '${root}/src/world/look.ts';\nwindow.hireTest={openHire,matchingWorkers,BUILTIN_ROLES,Roster,randomLook,seeded};`);
    const { build } = await import('vite');
    await build({ configFile: false, root: process.cwd(), logLevel: 'error', build: { outDir: folder, emptyOutDir: false, lib: { entry, name: 'HireTest', formats: ['iife'], fileName: () => 'test.js', cssFileName: 'test' } } });
    fs.writeFileSync(path.join(folder, 'index.html'), '<html><head><meta charset="utf-8"><link rel="stylesheet" href="test.css"></head><body><script src="test.js"></script></body></html>');
    const env = { ...process.env, LUCID_HIRE_ARTIFACTS: folder }; delete env.ELECTRON_RUN_AS_NODE;
    require('node:child_process').spawn(require('electron'), [__filename], { env, windowsHide: true, stdio: 'inherit' }).on('exit', c => process.exit(c || 0));
  })().catch(e => { console.error(e); process.exit(1); });
} else {
  const { app, BrowserWindow, clipboard, ClipboardItem } = require('electron');
  const folder = process.env.LUCID_HIRE_ARTIFACTS;
  app.setPath('userData', path.join(folder, 'profile'));
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ show: false, width: 1000, height: 1000, webPreferences: { backgroundThrottling: false } });
    try {
      await win.loadFile(path.join(folder, 'index.html'));
      const wc = win.webContents;
      wc.on('console-message', (event) => { if (event.level === 'error' || event.level === 3) console.error('renderer:', event.message); });
      wc.debugger.attach('1.3');
      await wc.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      const results = await wc.executeJavaScript(`(async () => { try {
        const {openHire,matchingWorkers,Roster,randomLook,seeded,BUILTIN_ROLES}=window.hireTest;
        const wait=ms=>new Promise(r=>setTimeout(r,ms));
        const checks=[],check=(v,name)=>{if(!v)throw Error(name);checks.push(name)};
        const roster=new Roster();
        roster.assign(Array.from({length:8},(_,i)=>({id:'t'+i,provider:i===7?'claudeAgent':'codex'})),new Set(),new Set());
        const names=['Quill','Byte','Lumen','Kilo','Sprocket','Rivet','Ada','Nova'];
        roster.robots.forEach((r,i)=>{r.name=names[i];r.model=i===0?'old':i===7?'opus':'sol';r.jobs=8-i;r.look=randomLook(seeded('hiring'+i),6)});
        let team=roster.robots,fail=true,calls=[],saved=0;
        const effort={id:'reasoningEffort',label:'Reasoning',type:'select',choices:[{id:'low',label:'Low'},{id:'medium',label:'Medium',isDefault:true},{id:'high',label:'High'}]};
        const config={source:'T3 defaults',selection:{providerInstanceId:'codex',model:'sol',options:{reasoningEffort:'high',serviceTier:'priority'}},providers:[{instanceId:'codex',name:'Codex',ready:true,models:['sol','terra'].map(slug=>({slug,name:slug==='sol'?'gpt-6.1-sol':'gpt-6.1-terra',isDefault:slug==='sol',options:[effort,{id:'serviceTier',label:'Speed',type:'select',choices:[{id:'default',label:'Standard',isDefault:true},{id:'priority',label:'Fast'}]}]}))},{instanceId:'claudeAgent',name:'Claude Code',ready:true,models:[{slug:'opus',name:'Opus',isDefault:true,options:[{id:'effort',label:'Effort',type:'select',choices:[{id:'max',label:'Max',isDefault:true}]}]}]}]};
        const opts={room:'p',roomTitle:'Lucid',seat:4,team,getTeam:()=>team,loadRuntime:async()=>structuredClone(config),roles:[...BUILTIN_ROLES],onNewRole(){},projects:null,saveAttachment:async(n,b)=>{saved++;return 'C:/attachments/'+n},onHire:async c=>{calls.push(c);await wait(20);if(fail)throw Error('Delivery unavailable')}};
        const q=s=>document.querySelector(s),change=(k,v)=>{const s=q('[data-setting='+k+']');s.value=v;s.dispatchEvent(new Event('change',{bubbles:true}))};
        openHire(opts);await wait(250);
        check(q('[data-setting=reasoningEffort]').value==='high'&&q('[data-setting=serviceTier]').value==='priority','saved T3 thinking and speed defaults');
        const name=()=>q('#hire-worker-name').textContent,actor=()=>document.querySelectorAll('.hire-stage-floor .world-walker').length;
        check(name()==='Byte'&&q('.hire-worker-count').textContent==='1 of 6'&&actor()===1,'free worker with the exact harness and model, most experienced first, standing in the preview');
        check(!document.querySelector('.cand')&&!document.querySelector('.hire-context-choice'),'no candidate ranking or context matching');
        q('.hire-next').click();check(name()==='Lumen'&&q('.hire-worker-count').textContent==='2 of 6'&&actor()===1,'switch between free workers with the same setup');
        change('model','terra');check(name()==='New hire'&&q('.hire-worker-pick').hidden&&actor()===1,'no worker with that model means a new hire');
        change('model','sol');check(name()==='Byte','returning to the model shows its free worker');
        q('.hire-task textarea').value='Build this interface with attached evidence';
        const input=q('.hire-files'),dt=new DataTransfer();dt.items.add(new File(['example'],'brief.txt',{type:'text/plain'}));input.files=dt.files;input.dispatchEvent(new Event('change'));
        const paste=new DataTransfer();paste.items.add(new File([new Uint8Array([1,2,3])],'screen.png',{type:'image/png'}));q('textarea').dispatchEvent(new ClipboardEvent('paste',{clipboardData:paste,bubbles:true,cancelable:true}));
        check(document.querySelectorAll('.hire-attachments>div').length===2,'general file picker and pasted image');
        q('.hire-attachments button').click();check(document.querySelectorAll('.hire-attachments>div').length===1,'attachment removal');
        const drop=new DataTransfer();drop.items.add(new File(['document'],'brief.txt',{type:'text/plain'}));q('.hire-composer').dispatchEvent(new DragEvent('drop',{dataTransfer:drop,bubbles:true,cancelable:true}));
        check(document.querySelectorAll('.hire-attachments>div').length===2,'file drop');
        q('form').requestSubmit();q('form').requestSubmit();await wait(80);
        check(calls.length===1&&calls[0].robotId===team[1].id&&!q('button[type=submit]').disabled&&q('.hire-msg').textContent.includes('Delivery unavailable'),'one launch at a time, shown worker hired, retryable error');
        check(q('textarea').value.includes('Build this interface')&&document.querySelectorAll('.hire-attachments>div').length===2,'failed launch retains prompt and files');
        check(calls[0].options.reasoningEffort==='high'&&calls[0].options.serviceTier==='priority'&&calls[0].task.includes('- file:')&&calls[0].task.includes('- image:'),'runtime options and both file types delivered');
        q('form').requestSubmit();await wait(80);check(calls[1].requestId===calls[0].requestId&&saved===2,'retry uses same launch identity and saved file bytes');
        change('provider','claudeAgent');check(name()==='Nova','harness switch shows that harness worker');
        check(q('[data-setting=effort]').value==='max'&&!q('[data-setting=reasoningEffort]'),'thinking options adapt to harness');
        q('.hire-reset').click();check(q('[data-setting=reasoningEffort]').value==='high'&&name()==='Byte','reset restores exact T3 defaults');
        team=team.filter(r=>r.id!==roster.robots[1].id);q('form').requestSubmit();await wait(30);
        check(q('.hire-msg').textContent.includes('took another job')&&calls.length===2&&name()==='Lumen','busy worker rejected before launch and the next free worker shown');
        fail=false;q('form').requestSubmit();await wait(80);check(!q('.hire-wrap')&&calls.at(-1).robotId===roster.robots[2].id,'successful hire closes');
        team=[];openHire(opts);await wait(60);check(name()==='New hire'&&actor()===1,'empty roster previews a new hire');
        q('textarea').value='Research distant quasars';q('form').requestSubmit();await wait(80);
        check(calls.at(-1).robotId===null&&!q('.hire-wrap'),'new hire launches without reusing anyone');
        check(document.querySelectorAll('.world-walker').length===0,'preview robot released on close');
        team=roster.robots;fail=true;
        openHire({...opts,loadRuntime:async()=>{throw Error('T3 offline')}});await wait(40);q('textarea').value='Do not lose this draft';
        check(q('.hire-runtime').textContent.includes('T3 offline')&&q('button[type=submit]').disabled,'offline setup blocks guessed runtime');
        window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
        let resolveOld;openHire({...opts,projects:[{id:'old',title:'Old project'},{id:'new',title:'New project'}],loadRuntime:id=>id==='old'?new Promise(r=>resolveOld=r):Promise.resolve({...structuredClone(config),source:'Project defaults'})});
        const project=q('.hire-project select');project.value='new';project.dispatchEvent(new Event('change'));await wait(30);resolveOld({...structuredClone(config),source:'Stale defaults'});await wait(30);
        check(q('.hire-runtime').textContent==='Project defaults','stale project defaults ignored');
        window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
        openHire({...opts,intent:'thread'});await wait(30);
        check(q('#hire-title').textContent==='New thread','office new-thread title');
        window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
        openHire({...opts,intent:'delegate'});await wait(30);
        check(q('#hire-title').textContent==='Delegate task'&&q('.hire-role').open,'office delegation exposes role');
        window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
        team=roster.robots;openHire(opts);await wait(200);
        q('textarea').value='Make the robot accessories visible while walking, sitting, and working at a desk. Preserve their hats, colors, and character.';
        await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
        window.hireUI={checks,opts,openHire,wait,check};return checks;
      } catch (e) { console.error('FAILED: ' + (e && e.stack || e)); throw e; } })()`);
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1sAAAAASUVORK5CYII=', 'base64');
      await clipboard.write([new ClipboardItem({ 'image/png': new Blob([png], { type: 'image/png' }) })]);
      await wc.executeJavaScript(`document.querySelector('.hire-task textarea').focus()`); wc.paste();
      await new Promise(r => setTimeout(r, 100));
      await wc.executeJavaScript(`window.hireUI.check(document.querySelectorAll('.hire-attachments img').length===1,'native clipboard image paste');document.querySelector('.hire-attachments button').click();window.hireUI.check(document.querySelectorAll('.hire-wrap').length===1,'one active hiring dialog');`);
      await new Promise(r => setTimeout(r, 80));
      fs.writeFileSync(path.join(folder, 'desktop.png'), (await wc.capturePage()).toPNG());
      for (const [name, width, height, zoom] of [['narrow', 390, 760, 1], ['zoom', 1000, 850, 1.5], ['short', 760, 540, 1]]) {
        win.setSize(width, height); wc.setZoomFactor(zoom);
        await new Promise(r => setTimeout(r, 150));
        await wc.executeJavaScript(`(() => {const check=window.hireUI.check;const f=document.querySelector('form'),r=f.getBoundingClientRect();check(r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1,'${name}: dialog within viewport');check(f.scrollWidth<=f.clientWidth+1,'${name}: no horizontal overflow');const footer=document.querySelector('.hire-footer').getBoundingClientRect();check(footer.bottom<=innerHeight+1,'${name}: hire action visible');const body=document.querySelector('.hire-body');body.scrollTop=body.scrollHeight;body.scrollTop=0;const st=document.querySelector('.hire-stage').getBoundingClientRect();check(st.top>=body.getBoundingClientRect().top-1&&st.width>0,'${name}: worker preview visible');})()`);
        fs.writeFileSync(path.join(folder, name + '.png'), (await wc.capturePage()).toPNG());
      }
      const checks = await wc.executeJavaScript('window.hireUI.checks');
      fs.writeFileSync(path.join(folder, 'checks.json'), JSON.stringify({ ok: true, checks }, null, 2));
      console.log(JSON.stringify({ ok: true, checks, artifacts: folder }, null, 2));
      win.destroy(); app.exit(0);
    } catch (error) { console.error(error); win.destroy(); app.exit(1); }
  });
}
