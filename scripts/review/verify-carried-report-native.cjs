// Actual Walker/QuestionLine in a private native window. No T3 or production profile writes.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');
const root = path.resolve(__dirname, '../..'), out = path.resolve(process.argv[2] || require('node:path').join(require('node:os').tmpdir(), 'lucid-carried-report'));
const baseline = 'fb143a8441d6f2cd2fc37e31f217aee0be661416';
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
if (!process.versions.electron) {
  (async () => {
    fs.mkdirSync(out, { recursive: true });
    const src = root.replaceAll('\\', '/');
    const entry = path.join(out, 'entry.ts');
    fs.writeFileSync(entry, `import {Walker} from '${src}/src/robot/walker/walker';
import {QuestionLine} from '${src}/src/world/queue';
import '${src}/node_modules/@fontsource-variable/lexend/index.css';
import '${src}/src/world/world.css';
window.review={Walker,QuestionLine};`);
    const before = Object.fromEntries(['src/robot/walker/walker.ts', 'src/world/queue.ts'].map(p => [path.join(root, p).replaceAll('\\','/'), execFileSync('git', ['show', baseline + ':' + p], { cwd: root, encoding: 'utf8' })]));
    for (const mode of ['before', 'after']) {
      const dir = path.join(out, mode);
      await (await import('vite')).build({ configFile: false, logLevel: 'error', plugins: mode === 'before' ? [{ name: 'retained-baseline', enforce: 'pre', load(id) { return before[id.replaceAll('\\', '/')] ?? null; } }] : [], build: { outDir: dir, emptyOutDir: false, lib: { entry, name: 'ReportReview', formats: ['iife'], fileName: () => 'fixture.js', cssFileName: 'fixture' } } });
      fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'"><link rel="stylesheet" href="fixture.css"><style>body{margin:0;background:#b99c7d;color:#332d37;font:16px 'Lexend Variable',sans-serif;--font:'Lexend Variable',sans-serif}#stage{position:relative;width:1080px;height:640px;background:repeating-linear-gradient(0deg,transparent 0 79px,#a98e7130 80px 82px),#b99c7d}.label{position:absolute;top:32px;text-align:center;width:220px;font-size:16px}#queue{position:relative;width:1000px;height:800px}</style><div id="stage"></div><div id="queue" hidden></div><script src="fixture.js"></script>`);
    }
    fs.writeFileSync(path.join(out, 'provenance.json'), JSON.stringify({ baselineCommit: baseline, baseline: 'Retained production components rebuilt in the same isolated fixture, not an installed-app capture.', source: Object.fromEntries(['src/robot/walker/walker.ts','src/world/queue.ts'].map(p=>[p,hash(path.join(root,p))])), bundles: Object.fromEntries(['before','after'].map(m=>[m,hash(path.join(out,m,'fixture.js'))])) }, null, 2));
    const env = {...process.env}; delete env.ELECTRON_RUN_AS_NODE;
    spawn(require('electron'),[__filename,out],{env,windowsHide:true,stdio:'inherit'}).on('exit',c=>process.exit(c ?? 1));
  })().catch(e=>{console.error(e);process.exitCode=1;});
} else {
  const {app,BrowserWindow}=require('electron');
  app.setPath('userData',path.join(out,'profile'));
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  const result={checks:[],captures:[],errors:[],provenance:JSON.parse(fs.readFileSync(path.join(out,'provenance.json'),'utf8'))};
  app.whenReady().then(async()=>{
    const win=new BrowserWindow({show:false,width:1080,height:640,webPreferences:{offscreen:true,backgroundThrottling:false,sandbox:true}});
    const ev=s=>win.webContents.executeJavaScript(s.startsWith('window.walkers=') ? s+'\nvoid 0' : s), wait=ms=>new Promise(r=>setTimeout(r,ms));
    const check=(name,ok)=>{result.checks.push({name,ok:!!ok});if(!ok)throw Error(name)};
    const capture=async name=>{const p=path.join(out,name+'.png');fs.writeFileSync(p,(await win.webContents.capturePage()).toPNG());result.captures.push({path:p,sha256:hash(p)});};
    win.webContents.on('render-process-gone',(_,v)=>result.errors.push(v.reason));
    const timeout=setTimeout(()=>{result.errors.push('Deadline exceeded');save(false);app.exit(1)},45000);
    function save(ok){fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({...result,ok,finishedAt:new Date().toISOString()},null,2));}
    try {
      for(const mode of ['before','after']) {
        await win.loadFile(path.join(out,mode,'index.html'));
        await ev(`window.walkers=['down','right','left','up'].map((face,i)=>{const label=document.createElement('div');label.className='label';label.style.left=(i*260+20)+'px';label.textContent=face==='down'?'Facing you':face==='up'?'Facing the desk':face==='right'?'Walking right':'Walking left';stage.append(label);const w=new review.Walker(stage,{id:'fixture-'+i,provider:'codex',name:'Echo',scale:.72,look:{accent:'#4ff0a0',hat:'bow',eyes:'pixel',tint:'none',sticker:'star',head:.95}});w.setPos(i*260+140,440);w.face(face);w.carryReport('Report: Make Review Reports Readable in Chat');w.do('wait');return w});`);
        await wait(1100); await capture(mode+'-directions');
        if(mode==='before') {check('Retained production baseline reproduces the floating report labels',await ev(`document.querySelectorAll('.world-card.on').length===4`));continue;}
        check('Every direction carries one real SVG page without a floating label',await ev(`walkers.every(w=>w.el.querySelectorAll('.world-report-sheet').length===1&&!w.el.querySelector('.world-card.on'))`));
        check('Report metadata remains available on the robot',await ev(`walkers.every(w=>w.el.title.includes('Make Review Reports Readable in Chat'))`));
        result.geometry=await ev(`walkers.map(w=>{const p=w.el.querySelector('.world-report-sheet'),g=p.getBoundingClientRect();return {facing:w.facing,page:{x:g.x,y:g.y,width:g.width,height:g.height},hand:w.el.querySelector('[data-k="handr"]')?.getAttribute('transform'),prop:p.parentElement.getAttribute('transform')}})`);
        check('Paper is a small prop relative to the robot',result.geometry.every(g=>g.page.width>20&&g.page.width<65&&g.page.height>40&&g.page.height<80));
        await ev(`walkers[1].setRunning(true);void walkers[1].walkPath([{x:walkers[1].x+90,y:walkers[1].y}]);`);
        await wait(220);await capture('after-walking');
        check('Running preserves the physical page',await ev(`!!walkers[1].el.querySelector('.world-report-sheet')&&!walkers[1].el.querySelector('.world-card.on')`));
        await ev(`walkers[0].do('hold-card',{card:'Report: Make Review Reports Readable in Chat'});`);await wait(450);
        check('Report presentation pose keeps the hand prop and hides the text box',await ev(`!!walkers[0].el.querySelector('.world-report-sheet')&&!walkers[0].el.querySelector('.world-card.on')`));
        await ev(`walkers[0].carryReport(null);walkers[0].do('hold-card',{card:'Which file should I open?'});`);await wait(350);
        check('Ordinary questions retain their existing readable card',await ev(`!walkers[0].el.querySelector('.world-report-sheet')&&walkers[0].el.querySelector('.world-card.on')?.textContent.includes('Which file')`));
        check('Releasing a report clears its tooltip metadata',await ev(`!walkers[0].el.title.includes('Report:')`));
        await ev(`walkers.forEach(w=>w.destroy());stage.hidden=true;queue.hidden=false;window.line=new review.QuestionLine(queue,1000,800);window.threads=Array.from({length:5},(_,i)=>({id:'report-'+i,title:'Report: Real report lifecycle fixture '+i,question:'Report: Real report lifecycle fixture '+i,provider:'codex',name:'Report robot '+i,report:true,look:{hat:'bow',accent:'#4ff0a0',eyes:'pixel'}}));line.setThreads(threads);`);
        await wait(1200);
        check('Queue recreation and waiting actors all retain their reports',await ev(`line.line.filter(q=>q.alive).length===5&&line.line.every(q=>q.w.el.querySelector('.world-report-sheet')&&!q.w.el.querySelector('.world-card.on'))`));
        await ev(`line.setThreads(threads.map(t=>({...t})));`);await wait(120);
        check('Unchanged queue refresh preserves actor identity and a single page',await ev(`line.line.length===5&&line.line.every(q=>q.w.el.querySelectorAll('.world-report-sheet').length===1)`));
        win.setContentSize(1000,800);await wait(3000);
        check('A report remains held at its settled waiting place',await ev(`line.line.some(q=>q.waiting&&q.settled&&q.w.el.querySelector('.world-report-sheet'))`));
        await capture('after-queue');
        await ev(`line.setThreads(threads.slice(1));`);await wait(100);
        check('Leaving review removes the page before the goodbye wave',await ev(`!line.line.find(q=>q.id==='report-0').w.el.querySelector('.world-report-sheet')`));
        await ev(`line.destroy()`);
        check('Queue destruction removes actors and report props',await ev(`!document.querySelector('.world-report-sheet')`));
      }
      check('Native renderer completed without crashes',result.errors.length===0);
      clearTimeout(timeout);save(true);console.log(JSON.stringify({ok:true,out,checks:result.checks.length}));app.exit(0);
    }catch(e){clearTimeout(timeout);result.errors.push(String(e.stack||e));await capture('failure').catch(()=>{});save(false);console.error(e);app.exit(1)}
  });
}
