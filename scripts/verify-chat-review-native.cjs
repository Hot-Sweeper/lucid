// Isolated production ChatPanel/report/CSS/Markdown/CSP/media fixture. No live T3.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { execFileSync, spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const baselineRef = process.env.LUCID_REVIEW_BASELINE || '0e03e7fc6c26946e522adedd0b9c3ae5c8c12290';
const out = process.env.LUCID_CHAT_REVIEW || path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-chat-review-')));
if (!process.versions.electron) {
  (async () => {
    fs.mkdirSync(out, { recursive: true });
    const baseline = {};
    for (const file of ['src/office/chat-panel.ts', 'src/office/office.css', 'src/office/report.css']) baseline[file] = execFileSync('git', ['show', baselineRef + ':' + file], { cwd: root, encoding: 'utf8' });
    for (const mode of ['before', 'after']) {
      const dir = path.join(out, mode); fs.mkdirSync(dir, { recursive: true });
      const src = root.replaceAll('\\', '/');
      await (await import('vite')).build({ configFile: false, logLevel: 'error', plugins: mode === 'before' ? [{ name: 'review-baseline', enforce: 'pre', load(id) { return baseline[id.replaceAll('\\', '/').slice(src.length + 1)] ?? null; } }] : [], build: { outDir: dir, emptyOutDir: false, lib: { entry: path.join(root, 'scripts/fixtures/chat-review-native.ts'), name: 'ReviewFixture', formats: ['iife'], fileName: () => 'fixture.js', cssFileName: 'fixture' } } });
      const csp = fs.readFileSync(path.join(root, 'index.html'), 'utf8').match(/<meta http-equiv="Content-Security-Policy"[^>]+>/)[0];
      fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><html><head>' + csp + '<link rel="stylesheet" href="fixture.css"><style>body{margin:0;background:#151831}#app{display:block;height:100vh}.chat-panel{position:relative;inset:auto!important;width:100%!important;max-width:100%;height:100vh!important;transform:none!important;opacity:1!important;visibility:visible!important}.cp-list{overflow:auto}</style></head><body><div id="app"></div><script src="fixture.js"></script></body></html>');
    }
    const archive = JSON.parse(fs.readFileSync(process.env.LUCID_REVIEW_ARCHIVE || 'E:/T3 Projects/Lucid Orchestrator/reports/index.json', 'utf8'));
    const example = JSON.parse(fs.readFileSync(path.join(root, 'scripts/fixtures/chat-review-example.json'), 'utf8'));
    const real = archive.find(p => p.id === example.report);
    const visual = archive.find(p => p.verdict?.before?.length && p.verdict?.after?.length && [...p.verdict.before, ...p.verdict.after].every(s => fs.existsSync(p.images.find(i => i.source === s)?.path || s)));
    if (!real || !visual) throw Error('Real screenshot report and archived genuine visual captures are required');
    fs.writeFileSync(path.join(out, 'input.json'), JSON.stringify({ example, real, visual }, null, 2));
    const env = { ...process.env, LUCID_CHAT_REVIEW: out }; delete env.ELECTRON_RUN_AS_NODE;
    spawn(require('electron'), [__filename], { env, windowsHide: true, stdio: 'inherit' }).on('exit', code => process.exit(code ?? 1));
  })().catch(error => { console.error(error); process.exitCode = 1; });
} else {
  const { app, BrowserWindow, protocol, net } = require('electron');
  const fsp = require('node:fs/promises'), { pathToFileURL } = require('node:url');
  const main = fs.readFileSync(path.join(root, 'electron/main.cjs'), 'utf8');
  const serve = main.match(/const SERVE = new Set\([^\n]+/)[0], start = main.indexOf('  protocol.handle("lucid-file",');
  const handler = main.slice(start, main.indexOf('\n  createWindow();', start));
  protocol.registerSchemesAsPrivileged([{ scheme: 'lucid-file', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
  app.setPath('userData', path.join(out, 'profile'));
  app.whenReady().then(async () => {
    const result = { assertions: [], screenshots: [], errors: [], source: {}, baseline: execFileSync('git', ['rev-parse', baselineRef], { cwd: root, encoding: 'utf8' }).trim() };
    for (const file of ['src/office/chat-panel.ts', 'src/office/chat-review.ts', 'src/office/office.css', 'src/office/report.ts', 'src/office/report.css', 'src/main.ts']) result.source[file] = require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
    const deadline = setTimeout(() => { result.errors.push('Native fixture exceeded 55 seconds'); fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); app.exit(1); }, 55000);
    const win = new BrowserWindow({ show: false, width: 620, height: 1100, webPreferences: { sandbox: true, backgroundThrottling: false } });
    const ev = code => win.webContents.executeJavaScript(code);
    const check = (value, label) => { if (!value) throw Error(label); result.assertions.push(label); };
    const capture = async name => { await ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))'); await new Promise(r => setTimeout(r, 150)); fs.writeFileSync(path.join(out, name), (await win.webContents.capturePage()).toPNG()); result.screenshots.push(name); };
    try {
      new Function('protocol', 'fsp', 'path', 'net', 'pathToFileURL', serve + '\n' + handler)(protocol, fsp, path, net, pathToFileURL);
      const input = JSON.parse(fs.readFileSync(path.join(out, 'input.json'), 'utf8'));
      for (const mode of ['before', 'after']) {
        await win.loadFile(path.join(out, mode, 'index.html'));
        await ev('fixture.setup(' + JSON.stringify(input) + ')');
        await capture(mode + '-example.png');
        if (mode === 'before') {
          check(await ev('!document.querySelector(".cp-review") && document.querySelector(".cp-list").textContent.includes("\\\"humanChecks\\\"")'), 'Baseline uses actual committed ChatPanel and supplied raw JSON');
          await win.setContentSize(360, 1000); await capture('before-example-narrow.png');
          await ev('fixture.longReport()'); await capture('before-long-narrow.png');
          await win.setContentSize(620, 1100); await ev('fixture.visual()'); await capture('before-visual.png');
          await ev('fixture.sourceSession(true)'); await capture('before-source-session.png'); continue;
        }
        await ev('fixture.example()');
        await win.setContentSize(360, 1000); await ev('fixture.narrow()'); await capture('after-example-narrow.png');
        await win.setContentSize(620, 1100); await ev('fixture.visual()'); await capture('after-visual-summary.png');
        await ev('fixture.captures()'); await capture('after-visual-captures.png');
        await ev('fixture.preview()'); await capture('after-image-preview.png'); await ev('fixture.closePreview()');
        await win.setContentSize(360, 1000); await ev('fixture.narrow();document.querySelector(".cp-review-images").scrollIntoView({block:"start"})'); await capture('after-visual-narrow.png');
        check(await ev('getComputedStyle(document.querySelector(".cp-review-images")).gridTemplateColumns.split(" ").length===1'), 'Captures stack in narrow chat');
        await ev('fixture.regression()'); await capture('after-long-narrow.png');
        await ev('fixture.human()'); await capture('after-human-workflow.png');
        await ev('fixture.answerAndStale()');
        await win.setContentSize(620, 1100); await ev('fixture.sourceSession()'); await capture('after-source-session.png');
        await win.setContentSize(360, 1000); await ev('fixture.narrow();document.querySelector(".cp-source-report").scrollIntoView({block:"start"})'); await capture('after-source-session-narrow.png');
        await ev('fixture.sourceUpdates()'); result.assertions.push(...await ev('fixture.checks'));
      }
      result.ok = true; clearTimeout(deadline); fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify({ ok: true, assertions: result.assertions.length, out })); app.exit(0);
    } catch (error) { result.errors.push(String(error.stack || error)); clearTimeout(deadline); fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); console.error(error); app.exit(1); }
  });
}
