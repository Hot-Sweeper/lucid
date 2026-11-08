// Build a real-engine app-library acceptance fixture, then serve it with --serve.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'lucid-song-library-'));
const entry=path.join(temp,'index.html');
fs.writeFileSync(entry, `<!doctype html><html lang="en"><meta charset="utf-8"><title>Song library review: ready</title>
<style>body{overflow:auto!important;height:auto!important}#app{height:660px!important;grid-template-columns:150px minmax(0,1fr)!important;width:100%;max-width:1280px;margin:auto}aside{padding:12px}#run{min-height:40px;margin:10px}#checks{white-space:pre-wrap;font:12px monospace;padding:12px;max-width:1200px}*{box-sizing:border-box}</style>
<button id="run" type="button">Run library checks</button><div id="app"><aside><button id="library" type="button">App library</button></aside><div id="scene">Office scene stays mounted</div></div><pre id="checks">Waiting for a trusted click. Fixture audio is muted.</pre>
<script type="module" src="${path.join(temp,'entry.ts')}"></script></html>`);
fs.writeFileSync(path.join(temp,'entry.ts'), `
import '${root}/node_modules/@fontsource-variable/lexend/index.css';
import '${root}/src/styles.css';
import '${root}/src/office/app-library.css';
import {openAppLibrary} from '${root}/src/office/app-library';
import {gameSound} from '${root}/src/office/sound';
import {SOUNDTRACK} from '${root}/src/office/soundtrack';
import {setLocale} from '${root}/src/localization';
const trigger=document.querySelector('#library')! as HTMLButtonElement;
trigger.onclick=()=>openAppLibrary(trigger);
const output=document.querySelector('#checks')!;
const engine=gameSound as any, report:string[]=[];
const assert=(ok:unknown,label:string)=>{if(!ok)throw Error(label);report.push('PASS '+label);output.textContent=report.join('\\n');};
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const until=async(fn:()=>boolean,label:string)=>{for(let n=0;n<150;n++){if(fn())return;await wait(40);}throw Error(label);};
const choose=(selector:string)=>{const el=document.querySelector(selector) as HTMLButtonElement;if(!el)throw Error('missing '+selector);el.click();};
const search=()=>document.querySelector('.sl-search input')! as HTMLInputElement;
const genre=()=>document.querySelector('.sl-genre select')! as HTMLSelectElement;
const input=(el:HTMLInputElement,value:string)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));};
const filter=(value:string)=>{genre().value=value;genre().dispatchEvent(new Event('change',{bubbles:true}));};
const visible=()=>[...document.querySelectorAll('.sl-track')].filter(el=>!(el as HTMLElement).hidden);
(window as any).songReview={engine,gameSound,setLocale,report,trigger};
let running=false;
document.querySelector('#run')!.addEventListener('click',async()=>{
 if(running)return;running=true;
 try{
  gameSound.configure(true,.45);gameSound.configureBackground('theme',.3);gameSound.pauseTheme(false);
  await until(()=>!!engine.master,'unlock');
  const silent=engine.context.createGain();silent.gain.value=0;engine.master.disconnect();engine.master.connect(silent);silent.connect(engine.context.destination);
  await until(()=>gameSound.musicState.status==='playing','initial playback');
  const baseline=engine.musicListeners.size;
  openAppLibrary(trigger);
  assert(document.querySelectorAll('.sl-track').length===SOUNDTRACK.length,'all '+SOUNDTRACK.length+' real songs appear');
  assert(!document.querySelector('.al-frame'),'real song library does not mount a demo frame');
  const list=document.querySelector('.sl-tracks')! as HTMLElement;
  assert(list.clientHeight>100&&list.scrollHeight>list.clientHeight,'song list has a usable bounded scroll region');
  assert((document.querySelector('.song-library')! as HTMLElement).scrollWidth<=(document.querySelector('.song-library')! as HTMLElement).clientWidth,'library fits the available width');
  if(gameSound.currentTheme?.id==='cassette-clouds'){
   choose('[data-song-id="neon-afterglow"]');
   await until(()=>gameSound.currentTheme?.id==='neon-afterglow'&&gameSound.musicState.status==='playing','prepare different song');
  }
  choose('[data-song-id="cassette-clouds"]');
  await until(()=>gameSound.currentTheme?.id==='cassette-clouds'&&gameSound.musicState.status==='playing','chosen song playback');
  assert(document.querySelector('[aria-current="true"] [data-song-id="cassette-clouds"]'),'chosen song is identified in the library');
  await wait(250);choose('[data-song-id="cassette-clouds"]');
  assert(gameSound.musicState.paused,'active row pauses actual playback');
  const track=engine.background.get('theme'),position=track.media.currentTime;
  choose('[data-song-id="cassette-clouds"]');
  await until(()=>gameSound.musicState.status==='playing','resume');
  assert(track.media.currentTime>=position,'row resumes the retained song');
  filter('mystical');assert(visible().length===1&&visible()[0].querySelector('[data-song-id="the-glass-observatory"]'),'new story genre finds its authored recording');
  filter('all');input(search(),'Glocken');assert(visible().length>=5,'localized instrument search finds bell textures');
  input(search(),'neon');assert(visible().length===1,'title search filters the real catalogue');
  filter('breakcore');assert(visible().length===0&&!document.querySelector('.sl-empty')!.hasAttribute('hidden'),'empty search explains no matches');
  input(search(),'');assert(visible().length===1,'genre filter finds melodic breakcore');
  choose('[data-song-id="petal-breaks"]');
  await until(()=>gameSound.currentTheme?.id==='petal-breaks'&&gameSound.musicState.status==='playing','breakcore selection');
  assert(gameSound.musicState.mode==='journey','a song pick preserves evolving direction');
  filter('all');input(search(),'petal');search().focus();
  const focus=document.activeElement;gameSound.configureMusic('phonk');
  assert(document.activeElement===focus&&search().value==='petal','playback updates retain search and focus');
  setLocale('de');assert(document.querySelector('.sl-search span')!.textContent==='Songs suchen','German library labels update immediately');setLocale('en');
  choose('.al-app[data-id="music"]');
  assert(!document.querySelector('.song-library')&&engine.musicListeners.size===baseline,'switching apps releases library subscriptions');
  assert(gameSound.musicState.status==='playing'&&gameSound.currentTheme?.id==='petal-breaks','switching apps keeps the music playing');
  choose('.al-app[data-id="soundtrack"]');assert(search().value==='petal','returning retains song search');
  choose('.al-close');
  assert(engine.musicListeners.size===baseline&&!document.querySelector('#scene')!.hasAttribute('inert'),'closing releases controls and restores office');
  assert(document.activeElement===trigger&&gameSound.musicState.status==='playing','closing restores focus without stopping music');
  openAppLibrary(trigger);filter('all');input(search(),'');
  document.querySelector('#app')!.setAttribute('style','width:540px');await wait(150);
  assert(getComputedStyle(document.querySelector('.al-browse')!).display==='none','narrow song view prioritizes the music library');
  choose('.al-back-apps');
  assert(getComputedStyle(document.querySelector('.al-browse')!).display!=='none','All apps returns to narrow app navigation');
  choose('.al-app[data-id="soundtrack"]');
  assert((document.querySelector('.sl-tracks')! as HTMLElement).clientHeight>100,'narrow song list remains scrollable');
  document.querySelector('#app')!.setAttribute('style','');
  assert(engine.background.size===2,'browsing never creates extra music streams');
  document.title='PASS: Song library review';output.textContent=report.join('\\n');
 }catch(error){document.title='FAIL: Song library review';output.textContent=report.join('\\n')+'\\nFAIL '+(error as Error).message+'\\n'+(error as Error).stack;}
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
