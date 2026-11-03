// Bounded native rendering of the production renderThreads function and sidebar CSS.
// Status fixtures never call T3, save a report, answer a question or settle a thread.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync,spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.resolve(process.argv[2]||'E:/Lucid-validation/thread-review-20261102');
const baseline='d58142b',hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
if(!process.versions.electron){(async()=>{
  fs.mkdirSync(out,{recursive:true});const src=root.replaceAll('\\','/');
  for(const mode of ['before','after']){
    const dir=path.join(out,mode);fs.mkdirSync(dir,{recursive:true});
    const main=mode==='before'?execFileSync('git',['show',baseline+':src/main.ts'],{cwd:root,encoding:'utf8'}):fs.readFileSync(path.join(root,'src/main.ts'),'utf8');
    const render=main.slice(main.indexOf('function renderThreads()'),main.indexOf('// A manager that changed',main.indexOf('function renderThreads()')));
    const entry=path.join(dir,'entry.ts');fs.writeFileSync(entry,`import {latestThreadReviews,threadReviewLabel} from '${src}/src/office/thread-review';
import '${src}/node_modules/@fontsource-variable/lexend/index.css';import '${src}/src/styles.css';import '${src}/src/office/office.css';
const appEl=document.querySelector('#app'),$=(id)=>document.getElementById(id),esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const world={lastData:{projects:[{id:'lucid',title:'Lucid',scratch:false}],threads:[]},roster:{byThread:()=>null},lookFor:(t,l)=>l,building:'Tim-PC'},orch={papers:[]},settings={orch:{threadId:'orchestrator'}},delegate={phaseOf:()=>null};
let currentEnvironment,thSig='',settledOpen=false,settledLimit=10,managersTween=null,managersJustOpened=false;
const folded=new Set(),beginSystem=()=>0,endSystem=()=>{},renderRail=()=>{},logoFor=()=>null,managerFace=()=>'',celebratePictures=()=>{},calm=()=>true,ago=()=> 'now';
${render}
window.review={world,orch,render:renderThreads,label:threadReviewLabel,index:latestThreadReviews,setEnvironment:v=>currentEnvironment=v};`);
    const oldCss=mode==='before'?execFileSync('git',['show',baseline+':src/office/office.css'],{cwd:root,encoding:'utf8'}):null;
    await(await import('vite')).build({configFile:false,logLevel:'error',plugins:oldCss?[{name:'old-css',enforce:'pre',load(id){return id.replaceAll('\\','/')===src+'/src/office/office.css'?oldCss:null}}]:[],build:{outDir:dir,emptyOutDir:false,lib:{entry,name:'ThreadReview',formats:['iife'],fileName:()=> 'fixture.js',cssFileName:'fixture'}}});
    fs.writeFileSync(path.join(dir,'index.html'),`<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'self' data:;style-src 'self' 'unsafe-inline';script-src 'self'"><link rel="stylesheet" href="fixture.css"><style>body{margin:0;background:#151933}#app{display:block;width:100vw;height:100vh}.panel{position:relative;inset:auto;width:100%;height:100%;padding:16px;box-sizing:border-box;overflow:auto}.th-list{max-height:none}.th-search{margin-bottom:12px}</style><div id="app"><section class="panel"><div class="th-search"><input id="th-q" aria-label="Find threads" placeholder="Find threads"></div><ol id="th-list" class="th-list"></ol></section></div><script src="fixture.js"></script>`);
  }
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;spawn(require('electron'),[__filename,out],{env,windowsHide:true,stdio:'inherit'}).on('exit',c=>process.exit(c??1));
})().catch(e=>{console.error(e);process.exitCode=1})}
else{const{app,BrowserWindow}=require('electron');app.setPath('userData',path.join(out,'profile'));app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,width:440,height:700,webPreferences:{sandbox:true,offscreen:true,backgroundThrottling:false}}),result={checks:[],captures:[],source:Object.fromEntries(['src/main.ts','src/office/thread-review.ts','src/office/office.css'].map(p=>[p,hash(path.join(root,p))])),baseline,scope:'Actual production renderThreads and CSS. Synthetic review states, no live mutations.'};
  const ev=s=>win.webContents.executeJavaScript(s),wait=ms=>new Promise(r=>setTimeout(r,ms)),check=(n,v)=>{result.checks.push({name:n,ok:!!v});if(!v)throw Error(n)},capture=async n=>{const p=path.join(out,n+'.png');fs.writeFileSync(p,(await win.webContents.capturePage()).toPNG());result.captures.push({path:p,sha256:hash(p)})};
  try{for(const mode of ['before','after']){
    await win.loadFile(path.join(out,mode,'index.html'));
    await ev(`window.base={id:'chat-report',projectId:'lucid',title:'Make Review Reports Readable in Chat',provider:'codex',runStatus:'completed',lastStatus:'completed',unseen:true,pinned:false,settled:false,question:null,updatedAt:'2026-11-02T21:42:00Z',runStartedAt:'2026-11-02T21:40:00Z'};window.paper={threadId:base.id,status:'submitted',submittedAt:'2026-11-02T21:42:10Z'};review.world.lastData.threads=[{...base,id:'active',title:'Give Robot Tool Windows a Real App Theme',runStatus:'running'},base];review.orch.papers=[paper];review.render();void 0`);
    await wait(150);await capture(mode+'-waiting');
    if(mode==='before'){check('Old row labels the unreviewed completed worker Done',await ev(`document.querySelector('[data-id="chat-report"] .th-st').textContent==='Done'`));continue;}
    check('Submitted report shows waiting for Orchestrator instead of Done',await ev(`document.querySelector('[data-id="chat-report"] .th-st').textContent==='Waiting for Orchestrator review'`));
    check('Active work retains Working and source thread order',await ev(`document.querySelector('.th-row').dataset.id==='active'&&document.querySelector('.th-row .th-st').textContent.startsWith('Working')`));
    for(const [status,label] of [['reviewing','Orchestrator reviewing'],['manual-review','Needs your review'],['pending-dependency','Review on hold'],['changes-requested','Changes requested'],['approved','Ready to collect']]){
      await ev(`review.orch.papers=[{...paper,status:${JSON.stringify(status)}}];review.render();`);
      check('Saved '+status+' is accurately presented',await ev(`document.querySelector('[data-id="chat-report"] .th-st').textContent===${JSON.stringify(label)}`));
    }
    check('Opening the chat does not hide the waiting status',await ev(`review.label({...base,unseen:false},paper)==='Waiting for Orchestrator review'`));
    check('Old verdict is not reused for a later completed run',await ev(`review.label({...base,runStartedAt:'2026-11-02T22:00:00Z'},{...paper,status:'changes-requested'},true)==='Awaiting report'`));
    check('Pinned managers, live questions, working and settled threads bypass completion review',await ev(`[{pinned:true},{question:'Need input'},{runStatus:'running'},{settled:true}].every(p=>review.label({...base,...p},paper)===null)`));
    check('Latest report selection uses submission time without reordering papers',await ev(`(()=>{const old={...paper,status:'changes-requested',submittedAt:'2026-11-01T12:00:00Z'},a=[old,paper],m=review.index(a);return m.get(base.id)===paper&&a[0]===old})()`));
    await ev(`review.setEnvironment('linked-machine');review.render();`);
    check('Linked computer does not inherit this computers local report',await ev(`document.querySelector('[data-id="chat-report"] .th-st').textContent==='Done'`));
    await ev(`review.setEnvironment(undefined);review.orch.papers=[paper];review.render();`);
    win.setContentSize(260,700);await wait(180);await capture('after-narrow');
    check('Long waiting label fits a narrow sidebar without clipping or horizontal overflow',await ev(`(()=>{const s=document.querySelector('[data-id="chat-report"] .th-st'),r=s.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&s.scrollWidth<=s.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth})()`));
    check('Narrow review status preserves the project name',await ev(`(()=>{const p=document.querySelector('[data-id="chat-report"] .th-proj');return p.scrollWidth<=p.clientWidth+1})()`));
  }result.ok=true;fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({ok:true,checks:result.checks.length,out}));app.exit(0)}catch(e){result.ok=false;result.error=String(e.stack||e);await capture('failure').catch(()=>{});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.error(e);app.exit(1)}
})}
