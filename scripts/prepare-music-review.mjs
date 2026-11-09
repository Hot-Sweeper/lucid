// Build an offline, real-engine browser acceptance fixture. Open its index.html
// in the hidden agent Firefox, then press Run checks (a trusted audio gesture).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-music-review-'));
const entry = path.join(temp, 'index.html');
fs.writeFileSync(entry, `<!doctype html><html lang="en"><meta charset="utf-8"><title>Music review: ready</title>
<style>body{overflow:auto!important;height:auto!important;margin:0;padding:32px;background:#141a33;color:#eef0ff;font:14px Lexend, sans-serif}main{width:320px;max-width:100%}#checks{white-space:pre-wrap;line-height:1.6;font:13px monospace}#run{min-height:40px;margin-bottom:20px}*{box-sizing:border-box}</style>
<main><button id="run" type="button">Run checks</button><div id="radio"></div></main><pre id="checks">Waiting for a trusted click. Audio output is muted in this fixture.</pre>
<script type="module" src="${path.join(temp,'entry.ts')}"></script></html>`);
fs.writeFileSync(path.join(temp,'entry.ts'), `
import '${root}/node_modules/@fontsource-variable/lexend/index.css';
import '${root}/src/styles.css';
import {gameSound} from '${root}/src/office/sound';
import {mountMusicControls} from '${root}/src/office/music-controls';
import {SOUNDTRACK} from '${root}/src/office/soundtrack';
import {songMatchesMode} from '${root}/src/office/soundtrack-queue';
import {setLocale} from '${root}/src/localization';
const cleanup=mountMusicControls(document.querySelector('#radio')!);
const output=document.querySelector('#checks')!;
const report: string[]=[];
const assert=(ok:unknown,message:string)=>{if(!ok)throw Error(message); report.push('PASS '+message);output.textContent=report.join('\\n');};
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const until=async(fn:()=>boolean,label:string)=>{for(let n=0;n<150;n++){if(fn())return;await wait(40);}throw Error(label);};
const engine=gameSound as any;
(window as any).musicReview={gameSound,setLocale,cleanup,report,SOUNDTRACK};
let running=false;
document.querySelector('#run')!.addEventListener('click',async()=>{
 if(running)return;running=true;
 try {
  gameSound.configure(true,.45);gameSound.configureBackground('theme',.3);gameSound.pauseTheme(false);
  await until(()=>!!engine.master,'audio unlock');
  const ctx=engine.context as AudioContext;
  const silent=ctx.createGain();silent.gain.value=0;engine.master.disconnect();engine.master.connect(silent);silent.connect(ctx.destination);
  await until(()=>gameSound.musicState.status==='playing','initial playback');
  let track=engine.background.get('theme');
  const analyser=ctx.createAnalyser();analyser.fftSize=2048;engine.master.connect(analyser);analyser.connect(silent);
  assert(engine.background.size===2,'two shared streaming sources');
  for(const mode of (['acoustic','ambient','lofi','jazz','phonk','synthwave','breakcore','pads','bells'] as const).filter(mode=>SOUNDTRACK.some(song=>songMatchesMode(song,mode)))){
   const before=gameSound.currentTheme!.id;
   gameSound.configureMusic(mode);
   assert(gameSound.currentTheme!.id===before,mode+' setting waits for boundary');
   gameSound.nextTheme();
   await until(()=>gameSound.musicState.status==='playing'&&songMatchesMode(gameSound.currentTheme!,mode),mode+' did not load');
   await until(()=>{const data=new Float32Array(2048);analyser.getFloatTimeDomainData(data);return Math.sqrt(data.reduce((n,v)=>n+v*v,0)/data.length)>.000001;},mode+' decoded signal');
   assert(true,mode+' real decoded signal');
  }
  track=engine.background.get('theme');gameSound.pauseTheme(true);const position=track.media.currentTime;
  await wait(250);assert(track.media.paused&&track.media.currentTime===position,'pause retains playhead');
  const pauseButton=document.querySelector('.office-radio-actions button') as HTMLButtonElement;
  assert(pauseButton.textContent==='Resume music','pause control follows actual state');
  pauseButton.click();await until(()=>gameSound.musicState.status==='playing','resume');
  assert(track.media.currentTime>=position,'resume continues the same song');
  gameSound.configureMusic('journey');
  const previous=engine.soundtrack.state.listened;await wait(1300);
  assert(engine.soundtrack.state.listened>previous,'journey counts real playback');
  const heard=engine.soundtrack.state.listened;track.media.currentTime+=25;await wait(100);
  assert(engine.soundtrack.state.listened-heard<1,'seek does not spend listening time');
  gameSound.configure(false);assert(track.media.paused,'global mute pauses music');
  gameSound.nextTheme();assert(track.media.paused,'Next cannot undo mute');
  gameSound.configure(true);await until(()=>gameSound.musicState.status==='playing','unmute');
  setLocale('de');assert(document.querySelector('.office-radio h3')!.textContent==='Büroradio','German controls update instantly');
  setLocale('en');
  const radio=document.querySelector('.office-radio')! as HTMLElement;
  assert(radio.scrollWidth<=radio.clientWidth,'settings content fits narrow shelf');
  const select=radio.querySelector('select')!;select.focus();assert(document.activeElement===select,'direction is keyboard reachable');
  assert(engine.background.size===2,'genre changes retain bounded source pool');
  gameSound.pauseTheme(true);
  document.title='PASS: Lucid music review';
  output.textContent=report.join('\\n')+'\\nNo subjective listening test. Native output muted.';
 }catch(error){document.title='FAIL: Lucid music review';output.textContent=report.join('\\n')+'\\nFAIL '+(error as Error).message+'\\n'+JSON.stringify({state:gameSound.musicState,ctx:engine.context?.state,authorized:engine.authorized,hidden:document.hidden,media:[...engine.background.values()].map((t:any)=>({paused:t.media.paused,pending:t.pending,src:t.media.src,error:t.media.error?.message}))})+'\\n'+(error as Error).stack;}
});
`);
await build({configFile:false,root:temp,base:'./',logLevel:'warn',build:{outDir:path.join(temp,'build'),emptyOutDir:true,assetsInlineLimit:0,rollupOptions:{input:entry,output:{format:'iife'}}}});
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const builtHtml=walk(path.join(temp,'build')).find(file=>file.endsWith('.html'));
// IIFE scripts work from local files without a server or module-file CORS.
fs.writeFileSync(builtHtml,fs.readFileSync(builtHtml,'utf8').replace('type="module" crossorigin','defer').replaceAll('crossorigin',''));
console.log(builtHtml);
// Web Audio treats separate file:// media as cross-origin in Firefox. Serve only
// this throwaway fixture on loopback for real analyser/seek checks. Use --serve
// inside the hidden workspace; stopping that workspace terminates the server.
if (process.argv.includes('--serve')) {
  const { createServer } = await import('node:http');
  const directory = path.dirname(builtHtml);
  const server = createServer((req, res) => {
    const requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(directory, '.' + (requested === '/' ? '/index.html' : requested));
    if (!file.startsWith(directory + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404); res.end(); return;
    }
    const size = fs.statSync(file).size;
    const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.mp3':'audio/mpeg','.woff2':'font/woff2'};
    const headers = { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream', 'Accept-Ranges': 'bytes' };
    const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    if (range) {
      const start = Number(range[1]), end = Math.min(size - 1, range[2] ? Number(range[2]) : size - 1);
      if (start > end || start >= size) { res.writeHead(416); res.end(); return; }
      res.writeHead(206, {...headers,'Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':end-start+1});
      fs.createReadStream(file, {start,end}).pipe(res);
    } else { res.writeHead(200, {...headers,'Content-Length':size}); fs.createReadStream(file).pipe(res); }
  });
  server.listen(0, '127.0.0.1', () => console.log(`QA_URL=http://127.0.0.1:${server.address().port}/`));
}
