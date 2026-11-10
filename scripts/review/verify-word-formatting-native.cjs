// Bounded native Botword acceptance. Builds only a private component bundle,
// uses a separate Electron profile, and never connects to the installed app.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '../..');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const title = 'Stabilize Performance and Updates';
const report = [
  'Committed **`78a494a`** with scoped updater fixes, helpers, evidence and readable error-message wrapping. Unrelated edits and accepted backend proof were preserved.',
  'Passed **12 isolated native checks**, typechecking and focused feedback tests, including copied diagnostics, usability after failure and successful retry.',
  'Screenshots attached: [Before](<E:/T3 Projects/Lucid/docs/evidence/update-hardening-20261101/native-review/before-validation-failure.png>) · [Corrected failure](<E:/T3 Projects/Lucid/docs/evidence/update-hardening-20261101/native-review/after-validation-failure.png>) · [Successful retry](<E:/T3 Projects/Lucid/docs/evidence/update-hardening-20261101/native-review/after-successful-retry.png>)',
  'No production restart. This review and broader stabilization remain unsettled.',
].join('\n\n');
const rich = [
  '# Release notes',
  'A **bold result**, *careful emphasis*, ~~obsolete wording~~ and `const ready = true`.',
  '## Verification',
  '- Preserve the installed build\n  - Keep **saved drafts** intact\n  - Retain the original files',
  '3. Validate the candidate\n4. Promote the complete build',
  '- [x] Completed check\n- [ ] Pending review',
  '> A failed update leaves the working version available.',
  '| Check | Result |\n| --- | --- |\n| **TypeScript** | `passed` |\n| Retry | Ready |',
  '```ts\nconst ready = true;\nif (ready) {\n  retainWorkingBuild();\n}\n```',
  '[Documentation](https://example.invalid/docs) and [Local evidence](<E:/T3 Projects/Lucid/docs/evidence/long directory name/retained-native-capture.png>).',
  '---',
  '<img src="https://example.invalid/tracker" onerror="window.__wordInjected=1">\n\n<script>window.__wordInjected=2</script>\n\n[Unsafe](javascript:alert(1))',
  'Entities: &amp; &lt;tag&gt; &quot;quoted&quot; &#65;.\n\n<strong>Literal HTML</strong>',
  '[Quoted link](<https://example.invalid/?q=" onmouseover="window.__wordInjected=3>)\n\n[Entity URL](https://example.invalid/?a=1&amp;b=2)\n\n[Encoded unsafe](jav&#97;script:alert%281%29)',
].join('\n\n');
const typedReport = '**Bold text** and `inline code`.\n\n- First item\n- Second item\n\n| Name | Result |\n| --- | --- |\n| **Typed cell** | `ready` |';
const narrowReport = 'A labelled [file](<E:/T3 Projects/Lucid/a directory with spaces/screenshot.png>) and a long path:\n\n' + 'E:/long-directory-name/'.repeat(18) + 'capture.png';

async function prepare(out) {
  const generated = path.join(out, 'fixture');
  fs.mkdirSync(generated, { recursive: true });
  const sourceHashes = {};
  const importPath = name => JSON.stringify(path.join(root, name).replaceAll('\\', '/'));
  const entry = path.join(generated, 'entry.ts');
  fs.writeFileSync(entry, `
import ${importPath('node_modules/@fontsource-variable/lexend/index.css')};
import ${importPath('node_modules/@fontsource-variable/jetbrains-mono/index.css')};
import ${importPath('src/styles.css')};
import ${importPath('src/office-apps/office.css')};
import { Botword } from ${importPath('src/office-apps/botword.ts')};
import { reportDocument } from ${importPath('src/office-apps/word-markdown.ts')};
import { WM } from ${importPath('src/os/wm.ts')};
import ${importPath('src/harness/t3code.ts')};
import { setRenderView, releaseRenderView } from ${importPath('src/perf/render.ts')};
const host = document.getElementById('screen')!;
const keys: string[] = [], typing: boolean[] = [];
const robot = {setPose(){},mouseTo(){},lookAt(){},click(){},pressKey(key:string){keys.push(key)},setTyping(on:boolean){typing.push(on)},react(){},drink:async()=>{},holdPhone:async()=>{},wake(){},swipe(){},tap(){}} as any;
const wm = new WM(host, robot);
wm.speed = 12;
wm.prefs = {windows:'floating',tidiness:'normal',launch:'dock',switching:'click',office:'suite'} as any;
wm.setWallpaper('linear-gradient(145deg,#315f69,#122637)');
setRenderView(host, true, 1353, 820);
const word = new Botword(wm);
const source = ${JSON.stringify(report)}, rich = ${JSON.stringify(rich)}, title = ${JSON.stringify(title)};
async function show(mode:string, typed=false) {
  const doc = mode==='before' ? {kind:'word',name:title,blocks:[{kind:'h',level:0,text:title},{kind:'p',text:source}]} :
    mode==='report' ? reportDocument(title,source) : mode==='rich' ? reportDocument('Formatted document',rich) :
    mode==='narrow' ? reportDocument('Long text', ${JSON.stringify(narrowReport)}) :
    mode==='typed' ? reportDocument('Typed document', ${JSON.stringify(typedReport)}) :
    {kind:'word',name:'Imported document',blocks:[{kind:'h',level:0,text:'Imported document'},{kind:'p',text:'Bold italic underline plain',runs:[{t:'Bold ',b:true},{t:'italic ',i:true},{t:'underline ',u:true},{t:'plain'}]}]};
  await word.show(doc as any,{instant:!typed,typed:typed?'all':'none'});
  const win = wm.wins.get('botword')!;
  Object.assign(win.el.style,{left:'12px',top:'10px',width:mode==='narrow'?'310px':'796px',height:'396px'});
  (document.querySelector('.bw-canvas') as HTMLElement).scrollTop=0;
  return {keys:keys.length,typing:[...typing],hidden:document.hidden};
}
(window as any).wordFixture = {show,keys,typing,source,rich,dispose(){wm.destroy();releaseRenderView(host)}};
`);
  const { build } = await import(pathToFileURL(path.join(root, 'node_modules/vite/dist/node/index.js')).href);
  await build({
    configFile: false, root: generated, base: './', logLevel: 'error',
    plugins: [{
      name: 'record-tested-source',
      transform(_code, id) {
        const file = id.split('?')[0];
        if (file.startsWith(root.replaceAll('\\', '/') + '/src/') && fs.existsSync(file)) {
          sourceHashes[path.relative(root, file).replaceAll('\\', '/')] = sha(fs.readFileSync(file));
        }
      },
    }],
    build: { outDir: path.join(generated, 'assets'), emptyOutDir: true,
      lib: { entry, name: 'WordFormattingReview', formats: ['iife'], fileName: () => 'word-review.js', cssFileName: 'word-review' },
      rollupOptions: { output: { inlineDynamicImports: true } } },
  });
  for (const [name, hash] of Object.entries(sourceHashes)) assert.equal(sha(fs.readFileSync(path.join(root, name))), hash, `Source changed during fixture build: ${name}`);
  sourceHashes['scripts/review/verify-word-formatting-native.cjs'] = sha(fs.readFileSync(__filename));
  fs.writeFileSync(path.join(generated, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><title>Isolated Botword review</title><link rel="stylesheet" href="./assets/word-review.css"><style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#141a33}
#screen{position:relative;width:820px;height:461px;left:22px;top:18px;transform:scale(1.65);transform-origin:top left}
</style></head><body><div id="screen" class="screen"></div><script src="./assets/word-review.js"></script></body></html>`);
  fs.writeFileSync(path.join(out, 'tested-source.json'), JSON.stringify({
    at: new Date().toISOString(), sources: sourceHashes, bundleSha256: sha(fs.readFileSync(path.join(generated, 'assets/word-review.js'))),
    baseline: 'Reconstructed original Director report model: title plus one plain paragraph. Same actual Botword component and CSS.',
    reportSource: report, isolatedProfile: path.join(out, 'profile'), productionTouched: false,
  }, null, 2));
}

async function native(out) {
  const { app, BrowserWindow, session } = require('electron');
  app.setPath('userData', path.join(out, 'profile'));
  const result = { at: new Date().toISOString(), fixture: true, productionTouched: false, checks: [], captures: [], errors: [], networkAttempts: [] };
  const deadline = setTimeout(() => { result.status = 'timeout'; fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(result, null, 2)); app.exit(2); }, 45000);
  let win;
  const check = (name, ok, detail) => { result.checks.push({ name, ok: !!ok, detail }); assert(ok, name + ': ' + JSON.stringify(detail)); };
  try {
    await app.whenReady();
    session.defaultSession.webRequest.onBeforeRequest((request, done) => {
      const remote = !/^(file:|data:|devtools:)/.test(request.url);
      if (remote) result.networkAttempts.push(request.url);
      done({ cancel: remote });
    });
    win = new BrowserWindow({ width: 1400, height: 800, show: false,
      webPreferences: { contextIsolation: true, sandbox: true, offscreen: true, backgroundThrottling: false } });
    const wc = win.webContents;
    const ev = code => wc.executeJavaScript(code, true);
    wc.setWindowOpenHandler(() => { result.errors.push('Unexpected new window request'); return { action: 'deny' }; });
    wc.on('render-process-gone', (_event, details) => result.errors.push(details));
    wc.on('console-message', (_event, details) => { if (details?.level === 'error') result.errors.push(details.message); });
    const capture = async name => {
      await wait(220);
      const file = path.join(out, name + '.png');
      const bytes = (await wc.capturePage()).toPNG();
      fs.writeFileSync(file, bytes);
      result.captures.push({ name, file, sha256: sha(bytes) });
    };
    await win.loadFile(path.join(out, 'fixture/index.html'));
    wc.debugger.attach('1.3');
    await wc.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
    result.offscreenFocusEmulated = true;
    await ev('document.fonts.ready.then(()=>true)');
    await ev('window.wordFixture.show("before")');
    check('Before reconstructs raw Markdown', await ev('document.querySelector(".bw-page").textContent.includes("**12 isolated native checks**")'));
    check('Fixture loads the production T3 dock icon registration', await ev('!!document.querySelector(".dock [data-app=t3code] svg")&&!document.querySelector(".dock").textContent.includes("undefined")'));
    await capture('before-raw-markdown');
    await ev('window.wordFixture.show("report")');
    const formatted = await ev(`(()=>{const p=document.querySelector('.bw-page');return {bold:[...p.querySelectorAll('b')].map(e=>e.textContent),code:[...p.querySelectorAll('code')].map(e=>e.textContent),files:[...p.querySelectorAll('.bw-file')].map(e=>({label:e.textContent,path:e.title})),text:p.textContent,paragraphs:p.querySelectorAll('p').length}})()`);
    check('Report renders bold and inline code', formatted.bold.includes('12 isolated native checks') && formatted.code.includes('78a494a'), formatted);
    check('Report labels all local evidence links', formatted.files.length === 3 && formatted.files[0].label === 'Before' && formatted.files.every(link => link.path.startsWith('E:/T3 Projects/Lucid/')) && !formatted.text.includes('[Before]('));
    check('Report has separate paragraphs without literal formatting markers', formatted.paragraphs === 4 && !formatted.text.includes('**'));
    await capture('after-formatted-report');
    await ev('window.wordFixture.show("rich")');
    const richState = await ev(`(()=>{const p=document.querySelector('.bw-page'),a=p.querySelector('a');return {headings:[...p.querySelectorAll('h1,h2')].map(e=>e.textContent),lists:[...p.querySelectorAll('.bw-li')].map(e=>({text:e.textContent,level:e.style.getPropertyValue('--lvl'),marker:e.querySelector('.bw-tx').dataset.mk})),quotes:p.querySelectorAll('.bw-quote').length,tableBold:p.querySelector('.bw-table b')?.textContent,tableCode:p.querySelector('.bw-table code')?.textContent,code:p.querySelector('.bw-code')?.textContent,italic:p.querySelector('i')?.textContent,strike:p.querySelector('s')?.textContent,unsafe:p.querySelectorAll('img,script,iframe,object,[onerror],a[href^="javascript:"]').length,injected:window.__wordInjected||0,web:a?{href:a.getAttribute('href'),target:a.target,rel:a.rel}:null,rule:!!p.querySelector('hr')}})()`);
    check('Headings, nested bullets and ordered start render', richState.headings.includes('Release notes') && richState.headings.includes('Verification') && richState.lists.some(item => item.level === '1') && richState.lists.some(item => item.marker === '3.') && richState.lists.some(item => item.marker === '4.'), richState);
    check('Task markers remain explicit', richState.lists.some(item => item.marker === '\u2611') && richState.lists.some(item => item.marker === '\u2610'));
    check('Quotes, tables, emphasis and code preserve formatting', richState.quotes === 1 && richState.tableBold === 'TypeScript' && richState.tableCode === 'passed' && richState.code.includes('\n  retainWorkingBuild();\n') && richState.italic === 'careful emphasis' && richState.strike === 'obsolete wording' && richState.rule);
    check('Markup and unsafe URLs never become active DOM', richState.unsafe === 0 && richState.injected === 0);
    const entityState = await ev(`(()=>{const p=document.querySelector('.bw-page'),links=[...p.querySelectorAll('a')];return {text:p.textContent,activeAttributes:p.querySelectorAll('[onmouseover],[onerror]').length,strong:p.querySelectorAll('strong').length,entityHref:links.find(a=>a.textContent==='Entity URL')?.getAttribute('href'),quoted:links.find(a=>a.textContent==='Quoted link')?.getAttribute('href'),unsafeLink:links.some(a=>/javascript:/i.test(a.getAttribute('href')||''))}})()`);
    check('Entities decode once while literal HTML stays text', entityState.text.includes('Entities: & <tag> "quoted" A.') && entityState.text.includes('<strong>Literal HTML</strong>') && entityState.strong === 0, entityState);
    check('Link entities and quotes cannot inject attributes or script URLs', entityState.entityHref === 'https://example.invalid/?a=1&b=2' && !!entityState.quoted && entityState.activeAttributes === 0 && !entityState.unsafeLink, entityState);
    check('Web links have safe external semantics', richState.web?.href === 'https://example.invalid/docs' && richState.web.target === '_blank' && /noopener/.test(richState.web.rel));
    await capture('after-document-formatting');
    await ev(`document.querySelector('.bw-code').scrollIntoView({block:'center'});void 0`);
    await capture('after-document-code-and-links');
    await ev(`document.querySelector('.bw-page a').focus();document.querySelector('.bw-page a').addEventListener('focus',e=>window.wordLinkFocus=true);void 0`);
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'Tab', modifiers: ['shift'] });
    wc.sendInputEvent({ type: 'keyUp', keyCode: 'Tab', modifiers: ['shift'] });
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' });
    wc.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' });
    await wait(100);
    const focus = await ev(`(()=>{const a=document.querySelector('.bw-page a');return {active:document.activeElement===a,visible:a.matches(':focus-visible'),outline:getComputedStyle(a).outlineStyle,nativeReturn:!!window.wordLinkFocus}})()`);
    check('Native keyboard navigation focuses the link visibly', focus.active && focus.visible && focus.outline !== 'none' && focus.nativeReturn, focus);
    await ev('window.wordFixture.show("narrow")');
    const narrow = await ev(`(()=>{const p=document.querySelector('.bw-page'),c=document.querySelector('.bw-canvas');return {pageClient:p.clientWidth,pageScroll:p.scrollWidth,canvasClient:c.clientWidth,canvasScroll:c.scrollWidth,label:p.querySelector('.bw-file')?.textContent}})()`);
    check('Narrow document wraps long paths within the page', narrow.pageScroll <= narrow.pageClient + 1 && narrow.canvasScroll <= narrow.canvasClient + 1 && narrow.label === 'file', narrow);
    await capture('after-narrow-long-path');
    const typed = await ev('window.wordFixture.show("typed",true)');
    const typedState = await ev(`(()=>{const p=document.querySelector('.bw-page');return {bold:p.querySelector('b')?.textContent,code:p.querySelector('code')?.textContent,table:p.querySelector('.bw-table b')?.textContent,caret:!!p.querySelector('.caret'),saved:document.querySelector('.oa-save').textContent}})()`);
    check('Actual typed presentation completes styled with caret cleared', typedState.bold === 'Bold text' && typedState.code === 'inline code' && typedState.table === 'Typed cell' && !typedState.caret && typedState.saved === 'Saved' && typed.keys > 0 && typed.typing.includes(true) && typed.typing.at(-1) === false, { ...typedState, ...typed });
    await capture('after-typed-document');
    await ev('window.wordFixture.show("legacy")');
    check('Imported DOCX-style runs keep bold, italic and underline', await ev(`(()=>{const p=document.querySelector('.bw-p');return p.querySelector('b')?.textContent==='Bold '&&p.querySelector('i')?.textContent==='italic '&&p.querySelector('u')?.textContent==='underline '&&p.textContent==='Bold italic underline plain'})()`));
    const scripts = [];
    const parsed = (_event, method, data) => { if (method === 'Debugger.scriptParsed') scripts.push(data); };
    wc.debugger.on('message', parsed);
    await wc.debugger.sendCommand('Debugger.enable');
    const script = scripts.find(item => item.url.endsWith('/assets/word-review.js'));
    assert(script, 'Executing fixture bundle is visible in V8');
    const { scriptSource } = await wc.debugger.sendCommand('Debugger.getScriptSource', { scriptId: script.scriptId });
    result.executingBundleSha256 = sha(scriptSource);
    result.executingUrl = script.url;
    check('Executing V8 bytes match the private tested bundle', result.executingBundleSha256 === JSON.parse(fs.readFileSync(path.join(out, 'tested-source.json'))).bundleSha256);
    wc.debugger.removeListener('message', parsed);
    check('No external network or fixture renderer failures', result.networkAttempts.length === 0 && result.errors.length === 0, { network: result.networkAttempts, errors: result.errors });
    await ev('window.wordFixture.dispose();void 0');
    result.status = 'passed';
    console.log(`Botword native formatting passed: ${result.checks.length} checks and ${result.captures.length} screenshots. Results: ${path.join(out, 'results.json')}`);
  } catch (error) {
    result.status = 'failed'; result.error = error.stack;
    if (win && !win.isDestroyed()) fs.writeFileSync(path.join(out, 'failure.png'), (await win.webContents.capturePage()).toPNG());
    throw error;
  } finally {
    clearTimeout(deadline);
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(result, null, 2));
    if (win && !win.isDestroyed()) { if (win.webContents.debugger.isAttached()) win.webContents.debugger.detach(); win.destroy(); }
  }
}

const out = path.resolve(process.argv[2] || require('node:path').join(require('node:os').tmpdir(), 'lucid-word-formatting-native'));
if (process.versions.electron) native(out).then(() => require('electron').app.exit(0), error => { console.error(error); require('electron').app.exit(1); });
else {
  const started = Date.now();
  const deadline = setTimeout(() => { console.error('Word native fixture exceeded 60 seconds'); process.exit(2); }, 60000);
  (async () => {
    fs.mkdirSync(out, { recursive: true });
    await prepare(out);
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    for (const key of Object.keys(env)) if (key.startsWith('LUCID_')) delete env[key];
    const child = require('node:child_process').spawn(require('electron'), [__filename, out], { env, windowsHide: true, stdio: 'inherit' });
    clearTimeout(deadline);
    const ownedDeadline = setTimeout(() => { child.kill(); console.error('Word native fixture exceeded its total deadline'); process.exitCode = 2; }, Math.max(1, 60000 - (Date.now() - started)));
    child.once('exit', code => { clearTimeout(ownedDeadline); process.exitCode = code ?? 1; });
    child.once('error', error => { clearTimeout(ownedDeadline); console.error(error); process.exitCode = 1; });
  })().catch(error => { clearTimeout(deadline); console.error(error); process.exitCode = 1; });
}
