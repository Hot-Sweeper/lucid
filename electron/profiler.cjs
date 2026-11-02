// Opt-in live capture. F8 starts/stops; LUCID_PROFILE=1 starts on load.
const { app, contentTracing } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
function install(win) {
  const wc = win.webContents;
  let session = null, busy = false;
  async function toggle() {
    if (busy || wc.isDestroyed()) return;
    busy = true;
    try { if (session) await stop(); else await start(); }
    catch (error) { if (session) session.failure = error; console.error('Performance capture failed:', error); await stop().catch(() => {}); }
    finally { busy = false; if (session?.failure) { busy = true; void stop().catch(console.error).finally(() => { busy = false; }); } }
  }
  async function start() {
    if (wc.debugger.isAttached()) throw new Error('Close DevTools before recording');
    const dir = path.join(app.getPath('userData'), 'profiles', new Date().toISOString().replace(/[:.]/g, '-'));
    await fs.mkdir(dir, { recursive: true });
    session = { dir, queue: Promise.resolve(), timer: null, tracing: false };
    const s = session;
    s.trace = [];
    const write = (file, value) => {
      if (s.failure) return;
      s.queue = s.queue.then(() => fs.appendFile(path.join(dir, file), JSON.stringify(value) + '\n')).catch(error => {
        s.failure = error;
        clearInterval(s.timer);
        console.error('Profile write failed', error);
        setImmediate(() => { if (session === s && !busy) { busy = true; void stop().catch(console.error).finally(() => { busy = false; }); } });
      });
    };
    s.write = write;
    await fs.writeFile(path.join(dir, 'metadata.json'), JSON.stringify({ started: new Date().toISOString(), versions: process.versions, platform: process.platform, timeOrigin: await wc.executeJavaScript('performance.timeOrigin'), note: 'Frame intervals are requestAnimationFrame callback spacing, not GPU execution time. CPU sampling and tracing add overhead.' }, null, 2));
    wc.debugger.attach('1.3');
    s.listener = (_event, method, params) => {
      if (method === 'Tracing.dataCollected') s.trace.push(...params.value);
      if (method === 'Tracing.tracingComplete') s.traceComplete?.();
      if (method === 'Runtime.bindingCalled' && params.name === '__lucidProfileBatch') {
        try { write('frames-events.ndjson', JSON.parse(params.payload)); } catch (error) { console.error(error); }
      }
    };
    wc.debugger.on('message', s.listener);
    await wc.debugger.sendCommand('Runtime.enable');
    await wc.debugger.sendCommand('Runtime.addBinding', { name: '__lucidProfileBatch' });
    await wc.debugger.sendCommand('Profiler.enable');
    await wc.debugger.sendCommand('Profiler.start');
    await wc.debugger.sendCommand('Tracing.start', { transferMode: 'ReportEvents', categories: 'devtools.timeline,blink.user_timing,cc,gpu,viz,v8' });
    s.tracing = true;
    await wc.executeJavaScript(`(() => {
      let rows=[], last=null, frame=0, raf=0;
      const flush=()=>{if(rows.length){window.__lucidProfileBatch(JSON.stringify(rows));rows=[];}};
      const tick=t=>{rows.push({type:'frame',frame:frame++,t,interval:last===null?null:t-last});last=t;if(rows.length>=120)flush();raf=requestAnimationFrame(tick);};
      const observers=[];
      for(const type of ['longtask','long-animation-frame','event','layout-shift','measure','resource']) {
        if(!PerformanceObserver.supportedEntryTypes.includes(type))continue;
        const o=new PerformanceObserver(list=>{for(const e of list.getEntries())rows.push({type,entry:e.toJSON()});if(rows.length>=120)flush();});
        try{o.observe({type,buffered:false,...(type==='event'?{durationThreshold:16}:{})});observers.push(o);}catch{o.disconnect();}
      }
      const visibility=()=>{rows.push({type:'visibility',t:performance.now(),state:document.visibilityState});last=null;flush();};
      document.addEventListener('visibilitychange',visibility);
      const timer=setInterval(flush,1000);raf=requestAnimationFrame(tick);
      window.__stopLucidRecording=()=>{cancelAnimationFrame(raf);clearInterval(timer);observers.forEach(o=>o.disconnect());document.removeEventListener('visibilitychange',visibility);flush();delete window.__stopLucidRecording;};
      rows.push({type:'viewport',t:performance.now(),width:innerWidth,height:innerHeight,dpr:devicePixelRatio});
    })()`);
    s.timer = setInterval(() => write('processes.ndjson', { at: Date.now(), processes: app.getAppMetrics() }), 1000);
    console.log('Performance recording:', dir);
  }
  async function stop() {
    const s = session;
    if (!s) return;
    session = null;
    clearInterval(s.timer);
    try {
      if (!wc.isDestroyed()) {
        await wc.executeJavaScript('window.__stopLucidRecording?.()');
        if (wc.debugger.isAttached()) {
          const result = await wc.debugger.sendCommand('Profiler.stop');
          await fs.writeFile(path.join(s.dir, 'renderer.cpuprofile'), JSON.stringify(result.profile));
        }
      }
    } finally {
      if (s.tracing && wc.debugger.isAttached()) {
        try {
          await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(Error('Trace stop timeout')), 5000);
            s.traceComplete = () => { clearTimeout(timer); resolve(); };
            wc.debugger.sendCommand('Tracing.end').catch(error => { clearTimeout(timer); reject(error); });
          });
          await fs.writeFile(path.join(s.dir, 'chromium-trace.json'), JSON.stringify({traceEvents:s.trace}));
        } catch (error) { s.failure ||= error; }
      }
      if (s.listener) wc.debugger.removeListener('message', s.listener);
      if (wc.debugger.isAttached()) wc.debugger.detach();
      await s.queue;
      if (s.failure) throw s.failure;
      await fs.writeFile(path.join(s.dir, 'complete.json'), JSON.stringify({ stopped: new Date().toISOString() }));
      console.log('Performance capture saved:', s.dir);
    }
  }
  wc.on('before-input-event', (event, input) => { if (input.type === 'keyDown' && input.key === 'F8' && !input.isAutoRepeat) { event.preventDefault(); void toggle(); } });
  wc.on('did-finish-load', () => { if (process.env.LUCID_PROFILE === '1' && !session) void toggle(); });
  let closing = false;
  win.on('close', event => { if (session || busy) { event.preventDefault(); if (!closing) { closing = true; void (async () => { while (busy) await new Promise(resolve => setTimeout(resolve, 25)); await stop(); })().catch(console.error).finally(() => win.destroy()); } } });
}
module.exports = { install };

