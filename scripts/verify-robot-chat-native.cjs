const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
if (!process.versions.electron) {
  (async () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-chat-review-'));
    const root = process.cwd().replace(/\\/g, '/');
    const entry = path.join(folder, 'entry.ts');
    fs.writeFileSync(entry, [
      "import '" + root + "/node_modules/@fontsource-variable/lexend/index.css';",
      ...['src/styles.css','src/office/office.css','src/os/os.css'].filter(p => fs.existsSync(p)).map(p => "import '" + root + '/' + p + "';"),
      ...[['WM','src/os/wm.ts'],['Director','src/director.ts'],['T3CodeApp','src/harness/t3code.ts'],['Roster,chatAppFor','src/office/roster.ts'],['setRenderView','src/perf/render.ts']].map(([n,p]) => 'import {'+n+"} from '"+root+'/'+p+"';"),
      'window.review={WM,Director,T3CodeApp,Roster,chatAppFor,setRenderView};'
    ].join('\n'));
    await (await import('vite')).build({configFile:false,logLevel:'error',build:{outDir:folder,emptyOutDir:false,lib:{entry,name:'Review',formats:['iife'],fileName:()=> 'test.js',cssFileName:'test'}}});
    fs.writeFileSync(path.join(folder,'index.html'), '<html><head><link rel="stylesheet" href="test.css"><style>body{margin:0;background:#101329}#screen{position:relative;width:820px;height:461px;margin:20px}</style></head><body><div id="screen" class="screen"></div><script src="test.js"></script></body></html>');
    const env={...process.env,LUCID_CHAT_REVIEW:folder};delete env.ELECTRON_RUN_AS_NODE;
    require('node:child_process').spawn(require('electron'),[__filename],{env,windowsHide:true,stdio:'inherit'}).on('exit',c=>process.exit(c||0));
  })().catch(e=>{console.error(e);process.exit(1)});
} else {
  const {app,BrowserWindow}=require('electron'),folder=process.env.LUCID_CHAT_REVIEW;
  app.setPath('userData',path.join(folder,'profile')); app.commandLine.appendSwitch('disable-features','CalculateNativeWinOcclusion'); app.commandLine.appendSwitch('disable-renderer-backgrounding'); app.commandLine.appendSwitch('disable-background-timer-throttling'); app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
  app.whenReady().then(async()=>{
    const win=new BrowserWindow({show:true,x:40,y:40,focusable:true,skipTaskbar:true,width:880,height:550,webPreferences:{backgroundThrottling:false}});
    const out=path.resolve('docs/evidence/robot-chat-review');fs.mkdirSync(out,{recursive:true});
    const js=s=>win.webContents.executeJavaScript(s), wait=ms=>new Promise(r=>setTimeout(r,ms));
    const capture=async name=>fs.writeFileSync(path.join(out,name+'.png'),(await win.webContents.capturePage({x:20,y:20,width:820,height:461})).toPNG());
    try {
      win.webContents.on('console-message',(_e,...args)=>console.log('renderer',...args));
      await win.loadFile(path.join(folder,'index.html'));
      await js(`(() => {
        const {WM,Director,T3CodeApp,Roster,chatAppFor,setRenderView}=review;
        const check=(v,m)=>{if(!v)throw Error(m);(window.checks??=[]).push(m)};
        const roster=new Roster();roster.assign(Array.from({length:24},(_,i)=>({id:'review-'+i,provider:'codex'})),new Set(),new Set());
        check(roster.robots.every(r=>r.prefs.chatApp),'new robots have saved chat preference');
        const old=structuredClone(roster.robots);delete old[0].prefs.chatApp;localStorage.setItem('lucid:roster:v1',JSON.stringify(old));
        const migrated=new Roster();check(migrated.robots[0].prefs.chatApp===chatAppFor(old[0].id),'older robot preference migrates deterministically');
        const expected=roster.robots.map(r=>r.prefs.chatApp);roster.save();
        window.saved=expected;
        window.check=check;
        const robot={setTyping(on){window.typing=on},setPose(){},mouseTo(){},click(){},lookAt(){},pressKey(){},releaseKey(){}};
        const wm=new WM(document.querySelector('#screen'),robot);wm.robotName='Nimbus';wm.speed=3;
        wm.prefs={...roster.robots[0].prefs,chatApp:'native',windows:'floating',launch:'dock'};
        setRenderView(wm.root,true,820);
        const chat=new T3CodeApp(wm),nativeMessages=new T3CodeApp(wm,'user');
        const info={id:'review',title:'Robot chat review',provider:'codex',model:'gpt-6.1-sol',projectTitle:'Lucid'};
        chat.setInfo(info);nativeMessages.setInfo(info);
        const director=Object.assign(Object.create(Director.prototype),{wm,chat,nativeMessages,robot,items:new Map(),untilPresent:async()=>{},idleLife:{pending:false},stage:{say(){},setGlow(){}},onActivity(){}});
        window.state={wm,chat,nativeMessages,director};
        window.reply=()=>{director.items.set('reply',{id:'reply',type:'assistant_message',status:'completed',data:{text:'I have connected the robot chat preferences. Your messages stay together, and I use T3 Code to coordinate with the other agents.'}});return director.play('reply')};
      })()`);
      await wait(500);
      await js(`check(JSON.stringify(new review.Roster().robots.map(r=>r.prefs.chatApp))===JSON.stringify(saved),'preferences survive roster reload'); state.wm.prefs.chatApp='t3code'; state.chat.user('Can you keep me updated while the team works?').then(()=>undefined)`);
      await capture('t3-user-message');
      await js(`state.wm.prefs.chatApp='native'; state.nativeMessages.user('Can you keep me updated while the team works?').then(()=>undefined)`);
      await js(`window.replyDone=false;reply().then(()=>window.replyDone=true);void 0`);
      await wait(300);await capture('native-typing');
      await js(`check(typing&&document.querySelector('.lucid-chat .t3-typed').textContent.length>0,'native composer visibly types');`);
      for(let i=0;i<200;i++){if(await js("!!document.querySelector('.lucid-chat .t3-send.sending')"))break;await wait(20);}
      await capture('native-sending');
      await js("check(!!document.querySelector('.lucid-chat .t3-send.sending'),'native visibly sends');check(state.wm.wins.has('chat')&&state.wm.wins.has('t3code')&&state.wm.wins.get('chat')!==state.wm.wins.get('t3code'),'separate native and T3 windows');");
      await wait(1200);await capture('after-native');
      await js(`check(replyDone&&!typing&&document.querySelector('.lucid-chat .t3-msg').textContent.includes('connected'),'native reply sent');state.wm.prefs.chatApp='t3code';window.replyDone=false;reply().then(()=>window.replyDone=true);void 0`);
      for(let i=0;i<200;i++){if(await js("typing&&state.chat.compText.textContent.length>0"))break;await wait(20);}await capture('t3-typing');
      await js("check(typing&&state.chat.compText.textContent.length>0,'T3 user reply visibly composes');");
      for(let i=0;i<200;i++){if(await js("state.chat.send.classList.contains('sending')"))break;await wait(20);}
      await capture('t3-sending');await js("check(state.chat.send.classList.contains('sending'),'T3 visibly sends');");
      await wait(1200);await capture('after-t3');
      await js(`check(replyDone&&!typing&&state.director.messageApp==='t3code','T3 preference routes user reply');window.route=async(name,input,output,status='completed')=>{state.director.items.set('tool',{id:'tool',type:'dynamic_tool',status,data:{input,output}});return state.director.playTool('tool',name)};void 0;`);
      for(const pref of ['native','t3code']) {
        await js(`state.wm.prefs.chatApp=${JSON.stringify(pref)};window.nativeBefore=state.nativeMessages.feed.textContent;`);
        for(const [name,input,output] of [['t3_thread_send',{threadId:'helper',message:'Please review the chat behavior.'},'Delivered'],['t3_thread_read',{},'Review received.'],['orchestrator_capabilities',{},'Available'],['task_status',{},'Completed']]) {
          await js(`route(${JSON.stringify(name)},${JSON.stringify(input)},${JSON.stringify(output)})`);
          await js(`check(state.wm.isFront('t3code'),${JSON.stringify(pref+' '+name+' uses T3 Code')})`);
        }
        await js(`check(state.nativeMessages.feed.textContent===nativeBefore,'coordination leaves native conversation unchanged');`);
      }
      await js(`state.director.helperHints=new Map();state.director.openHelper=async(_id,opts)=>{window.delegated=opts.child};void 0;`);
      await js(`route('delegate_task',{task:'Review chat behavior',target:{provider:'codex'}},{structuredContent:{childThreadId:'review-helper'}})`);
      await js(`check(delegated==='review-helper'&&state.wm.isFront('t3code'),'delegation uses T3 and retains helper routing');`);
      await capture('agent-coordination');
      const results=await js(`({checks,saved,loaded:{scripts:[...document.scripts].map(s=>s.src),styles:[...document.styleSheets].map(s=>s.href)}})`);
      fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));app.exit(0);
    }catch(e){console.error(e);await capture('failure');app.exit(1)}
  });
}





