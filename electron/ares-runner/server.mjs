// Runs only on the execution host. No Codex credentials ever leave this process.
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { randomUUID, createHash } from 'node:crypto';
import { CodexServer } from './codex.mjs';
import { getBrowser, lookAtPage, closeBrowser } from './look.mjs';
const require = createRequire(import.meta.url);
const { verifier } = require('../studio-auth.cjs');
const { projectFile, publicAssetPath, mime } = require('../studio-paths.cjs');
const { tunnel } = require('../studio-socket.cjs');
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = process.env.LUCID_RUNNER_DATA || path.join(process.env.LOCALAPPDATA || os.homedir(), 'Lucid', 'ares-runner-data');
fs.mkdirSync(DATA, { recursive: true });
const config = JSON.parse(fs.readFileSync(path.join(DATA, 'runner.json'), 'utf8'));
const verify = verifier(config.publicKey);
const dbFile = path.join(DATA, 'projects.json');
let projects = []; try { projects = JSON.parse(fs.readFileSync(dbFile, 'utf8')); } catch {}
const runtimes = new Map(), approvalRequests = new Map();
let saveTimer;
const saveSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(save, 250); };
const save = () => { const tmp = dbFile + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(projects)); fs.renameSync(tmp, dbFile); };
const codex = new CodexServer({ version: '1.0.0' });
let models = [], catalogAt = 0;
const json = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(value)); };
const port = Number(config.port || 5198);
function project(id) { const p = projects.find(p => p.id === id); if (!p) throw Error('Project not found on this host.'); return p; }
function runtime(p) {
  let r = runtimes.get(p.id); if (r) return r;
  r = { loaded: false, starting: false, dev: null, devServer: null, activity: null, watchTimer: null, fingerprint: '', rendering: new Map() };
  runtimes.set(p.id, r);
  try { r.watcher = fs.watch(p.dir, { recursive: true }, (_event, name) => {
    if (!name || /(^|[\\/])(node_modules|\.git|\.next|\.lucid|dist|build)([\\/]|$)/.test(name)) return;
    clearTimeout(r.watchTimer); r.watchTimer = setTimeout(() => { p.version++; save(); }, 650);
  }); } catch (e) { r.activity = `File watching unavailable: ${e.message}`; }
  return r;
}
function entry(p, e) { p.sequence = (p.sequence || 0) + 1; e.revision = p.sequence; const old = p.entries.find(x => x.id === e.id); if (old) Object.assign(old, e); else p.entries.push(e); p.updatedAt = Date.now(); saveSoon(); }
function summary(p, after = 0) { const r = runtime(p); return { ...p, turn: p.turn || (r.starting ? { id: null, status: 'starting' } : null), entries: after > 0 ? p.entries.filter(e => (e.revision || 0) > after) : p.entries, activity: r.activity, host: os.hostname(), executionHost: 'Ares', approvals: [...approvalRequests.values()].filter(a => a.projectId === p.id).map(a => ({ id: a.id, method: a.method, params: a.params })) }; }
async function catalog() {
  await codex.start();
  if (!models.length || Date.now() - catalogAt > 60000) {
    let cursor = null, all = [];
    do { const page = await codex.request('model/list', { cursor }); all.push(...page.data); cursor = page.nextCursor; } while (cursor);
    models = all.filter(m => !m.hidden).map(m => ({ id: m.id, name: m.displayName, isDefault: m.isDefault, description: m.description, efforts: m.supportedReasoningEfforts.map(e => e.reasoningEffort), defaultEffort: m.defaultReasoningEffort })); catalogAt = Date.now();
  }
  return models;
}
const instructions = p => `You are building a real website inside Lucid on ${os.hostname()}, in ${p.dir}. The user watches saved rendered changes reconstructed with one designer cursor. This is playback, not literal mouse recording. Use one Codex session and do not spawn other agents for this visual build. Preserve an existing project stack. Plain HTML/CSS/JS and React/Vite are supported. Save coherent small sections, styles with markup, then focused refinements. Do not write the whole page in one save. Use apply_patch and UTF-8, not PowerShell ANSI Set-Content. Use find_images when choosing website imagery so real image references are visible in chat. Use stable ids on meaningful sections/elements so refinements track in place. Use view_page after significant changes and at desktop and mobile before finishing. Read its diagnostics and make a real improvement. Request approvals normally; never change global settings, credentials, sandbox policy or permissions. Keep source files inside this project. Do not deploy/publish unless asked. For framework projects, first save a minimal runnable shell, install dependencies, start and register the server BEFORE building the real sections, then save each section coherently so the user sees actual incremental renders. Install dependencies and start their dev server yourself through the normal Codex command tool, with loopback binding. Keep it running using the command tool session. Call register_preview with its actual printed localhost URL. Lucid never runs generated package scripts outside your sandbox. Then use view_page. If the server stops, restart it and register the new actual URL. Keep replies concise.`;
const imageTool = { type: 'function', name: 'find_images', description: 'Search Wikimedia Commons for real image references. Returns thumbnail URLs, originals, source pages and license metadata, and shows the results to the user. Use this when choosing website images. Download chosen assets into the project and retain attribution.', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false } };
const previewTool = { type: 'function', name: 'register_preview', description: 'Register the actual loopback URL printed by this project dev server after starting it through your scoped command tool. Never guess a port.', inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'], additionalProperties: false } };
const visualTool = { type: 'function', name: 'view_page', description: 'Render the actual website on Ares. Returns a screenshot and real console, network and overflow diagnostics. Use the feedback to refine the site.', inputSchema: { type: 'object', properties: { viewport: { type: 'string', enum: ['desktop', 'tablet', 'mobile'] }, theme: { type: 'string', enum: ['light', 'dark'] }, page: { type: 'string' }, selector: { type: 'string' } }, additionalProperties: false } };
async function ensureThread(p) {
  const r = runtime(p); await catalog(); if (r.loaded) return;
  const opts = { cwd: p.dir, model: p.model, sandbox: 'workspace-write', approvalPolicy: 'on-request', approvalsReviewer: 'user', developerInstructions: instructions(p) };
  if (p.threadId) {
    // A failed resume must not create a replacement or replay the submitted prompt.
    await codex.request('thread/resume', { ...opts, threadId: p.threadId });
  } else {
    const result = await codex.request('thread/start', { ...opts, dynamicTools: [visualTool, previewTool, imageTool], serviceName: 'lucid', config: { 'sandbox_workspace_write.network_access': true } });
    p.threadId = result.thread.id; save();
  }
  r.loaded = true;
}
function findByThread(id) { return projects.find(p => p.threadId === id); }
function itemEntry(i) {
  if (i.type === 'agentMessage') return { id: i.id, kind: 'agent', text: i.text || '' };
  if (i.type === 'reasoning') return { id: i.id, kind: 'reasoning', text: i.summary?.join('\n') || '' };
  if (i.type === 'commandExecution') return { id: i.id, kind: 'command', label: i.commandActions?.[0]?.type && i.commandActions[0].type !== 'unknown' ? i.commandActions[0].type : 'Command', text: i.command || '', output: i.aggregatedOutput?.slice(-12000), status: i.status, exitCode: i.exitCode };
  if (i.type === 'fileChange') return { id: i.id, kind: 'files', text: i.changes?.map(c => c.path).join('\n') || '', status: i.status };
  if (i.type === 'dynamicToolCall') return { id: i.id, kind: i.tool === 'view_page' ? 'look' : 'tool', text: i.tool, status: i.status };
  if (i.type === 'webSearch') return { id: i.id, kind: 'search', text: i.query || i.action?.query || 'Searching the web', status: i.status };
  if (i.type === 'mcpToolCall') return { id: i.id, kind: 'tool', text: `${i.server}: ${i.tool}`, status: i.status };
  return null;
}
codex.on('notification', (method, a) => {
  const p = findByThread(a.threadId); if (!p) return;
  const r = runtime(p);
  if (method === 'turn/started') { p.turn = { id: a.turn.id, status: 'working', startedAt: Date.now() }; save(); }
  if (method === 'turn/completed') {
    p.lastTurn = { id: a.turn.id, status: a.turn.status, error: a.turn.error?.message }; p.turn = null; r.activity = null; p.version++;
    for (const [id, pending] of approvalRequests) if (pending.projectId === p.id) { pending.reject(Error('The turn ended.')); approvalRequests.delete(id); }
    entry(p, { id: `end-${a.turn.id}`, kind: a.turn.status === 'failed' ? 'error' : 'end', text: a.turn.error?.message || a.turn.status });
  }
  if (method === 'item/started' || method === 'item/completed') { const e = itemEntry(a.item); if (e) entry(p, e); if (method.endsWith('started')) r.activity = a.item.type; }
  if (method === 'item/agentMessage/delta' || method === 'item/reasoning/summaryTextDelta') {
    const e = p.entries.find(x => x.id === a.itemId) || { id: a.itemId, kind: method.includes('agentMessage') ? 'agent' : 'reasoning', text: '' };
    e.text += a.delta; entry(p, e);
  }
  if (method === 'item/commandExecution/outputDelta') { const e = p.entries.find(e => e.id === a.itemId); if (e) { e.output = ((e.output || '') + a.delta).slice(-12000); saveSoon(); } }
  if (method === 'error') { r.activity = a.willRetry ? 'Reconnecting to Codex' : 'Codex failed'; if (!a.willRetry) entry(p, { id: randomUUID(), kind: 'error', text: a.error?.message || 'Codex reported an error.' }); }
});
codex.on('exit', error => {
  for (const p of projects) { const r = runtime(p); r.loaded = false; r.activity = null; if (p.turn) { p.lastTurn = { id: p.turn.id, status: 'failed', error: error.message }; p.turn = null; entry(p, { id: randomUUID(), kind: 'error', text: `${error.message} The session is preserved. Reconnect before sending another message.` }); } }
  for (const a of approvalRequests.values()) a.reject(error); approvalRequests.clear();
});
for (const method of ['item/commandExecution/requestApproval', 'item/fileChange/requestApproval', 'item/permissions/requestApproval', 'item/tool/requestUserInput']) codex.onRequest(method, params => new Promise((resolve, reject) => {
  const p = findByThread(params.threadId); if (!p || !p.turn) return reject(Error('No matching active project turn.'));
  const id = randomUUID(); approvalRequests.set(id, { id, projectId: p.id, method, params, resolve, reject }); runtime(p).activity = 'Waiting for your approval';
}));
codex.onRequest('item/tool/call', async a => {
  const p = findByThread(a.threadId); if (!p) throw Error('Unknown project.');
  if (a.tool === 'find_images') {
    const query = String(a.arguments?.query || '').trim().slice(0, 250); if (!query) throw Error('Enter an image search query.');
    const url = new URL('https://commons.wikimedia.org/w/api.php');
    url.search = new URLSearchParams({ action: 'query', format: 'json', generator: 'search', gsrsearch: query, gsrnamespace: '6', gsrlimit: '6', prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '480' }).toString();
    const response = await fetch(url, { headers: { 'User-Agent': 'LucidWebsiteStudio/1.0 (private project visual inspection)' }, signal: AbortSignal.timeout(20000) }); if (!response.ok) throw Error(`Image search returned HTTP ${response.status}.`);
    const result = await response.json(), clean = value => String(value || '').replace(/<[^>]*>/g, '').slice(0, 350);
    const images = Object.values(result.query?.pages || {}).map(page => { const info = page.imageinfo?.[0]; return info && { title: page.title.replace(/^File:/, ''), image: info.thumburl || info.url, original: info.url, source: info.descriptionurl, license: clean(info.extmetadata?.LicenseShortName?.value), artist: clean(info.extmetadata?.Artist?.value) }; }).filter(Boolean);
    entry(p, { id: `images-${a.callId}`, kind: 'research', text: query, images });
    return { success: true, contentItems: [{ type: 'inputText', text: JSON.stringify({ query, images }) }] };
  }
  if (a.tool === 'register_preview') { const url = new URL(a.arguments?.url); if (!['http:', 'https:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error('Use the actual loopback dev-server origin with its printed port.'); runtime(p).previewUrl = url.href; runtime(p).previewPromise = null; entry(p, { id: `preview-${a.callId}`, kind: 'tool', text: `Project dev server: ${url.href}` }); return { success: true, contentItems: [{ type: 'inputText', text: `Registered ${url.href} for this project on Ares. Use view_page to inspect it.` }] }; }
  if (a.tool !== 'view_page') throw Error('Unknown project/tool.');
  const args = a.arguments || {}; runtime(p).activity = 'Inspecting the actual website';
  try {
    const base = await ensurePreview(p);
    const page = typeof args.page === 'string' && !args.page.includes('..') && !/^\w+:/.test(args.page) ? args.page.replace(/^\/+/, '') : '';
    const result = await lookAtPage(base + page, { viewport: args.viewport, theme: args.theme, selector: args.selector, fullPage: true });
    entry(p, { id: `look-${a.callId}`, kind: 'inspection', text: result.notes, image: result.image, viewport: args.viewport || 'desktop' });
    return { success: true, contentItems: [{ type: 'inputText', text: result.notes }, { type: 'inputImage', imageUrl: result.image }] };
  } catch (e) { entry(p, { id: `look-${a.callId}`, kind: 'error', text: `Render failed: ${e.message}` }); return { success: false, contentItems: [{ type: 'inputText', text: e.message }] }; }
});
// Static and framework previews are unprivileged, loopback-only services, separate from RPC.
async function ensurePreview(p) {
  const r = runtime(p); let kind = 'static'; try { const pkg = JSON.parse(await fsp.readFile(path.join(p.dir, 'package.json'), 'utf8')); if (pkg.scripts?.dev) kind = 'framework'; } catch {}
  if (r.previewKind !== kind) { r.devServer?.close(); r.previewPromise = null; r.previewKind = kind; }
  if (r.previewPromise) return r.previewPromise;
  r.previewPromise = startPreview(p).catch(e => { r.previewPromise = null; throw e; }); return r.previewPromise;
}
async function startPreview(p) {
  const r = runtime(p); let pkg; try { pkg = JSON.parse(await fsp.readFile(path.join(p.dir, 'package.json'), 'utf8')); } catch {}
  if (pkg?.scripts?.dev) {
    if (!r.previewUrl) throw Error('Waiting for the project dev server on Ares. Ask Codex to start it and call register_preview with its actual URL.');
    return r.previewUrl;
  }
  const server = http.createServer(async (req, res) => {
    try { const file = projectFile(p.dir, req.url); res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(file).pipe(res); } catch { res.writeHead(404); res.end('The project has not saved this page yet.'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); r.devServer = server; return `http://127.0.0.1:${server.address().port}/`;
}
async function render(p, width, theme) {
  const r = runtime(p), key = `${p.version}-${width}-${theme}`;
  if (r.rendering.has(key)) return r.rendering.get(key);
  const task = (async () => {
    const base = await ensurePreview(p), browser = await getBrowser();
    const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme, serviceWorkers: 'block' });
    await context.route('**/*', route => ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort('blockedbyclient'));
    const page = await context.newPage(), problems = [];
    page.on('pageerror', e => problems.push(e.message)); page.on('response', res => { if (res.status() >= 400) problems.push(`HTTP ${res.status()}: ${res.url()}`); });
    try {
      const response = await page.goto(base, { waitUntil: 'networkidle', timeout: 20000 }).catch(async e => { if (page.url() === 'about:blank') throw e; return null; });
      if (response && !response.ok()) throw Error(`Preview returned HTTP ${response.status()}.`);
      await page.evaluate(() => Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 1500))])); await page.waitForTimeout(180);
      const missingCSS = await page.evaluate(() => [...document.querySelectorAll('link[rel~=stylesheet]')].some(l => !l.sheet));
      if (missingCSS) throw Error('Waiting for the saved stylesheet.');
      const html = await page.evaluate(async () => {
        // Serialize the rendered DOM, including framework output, but never execute it during playback.
        const root = document.documentElement.cloneNode(true);
        const styles = [...document.styleSheets];
        // Inline loaded CSS so old render versions keep their real before styling across saves.
        for (const [index, sheet] of styles.entries()) { try { const text = [...sheet.cssRules].map(r => r.cssText).join('\n'); const original = sheet.ownerNode; if (!original) continue; const list = [...document.querySelectorAll('style,link[rel=stylesheet]')], clone = root.querySelectorAll('style,link[rel=stylesheet]')[list.indexOf(original)]; if (clone) { const style = document.createElement('style'); style.textContent = text.replace(/url\((['"]?)(?!data:|https?:|\/)([^)'"\s]+)\1\)/g, (_m, q, value) => `url("${new URL(value, sheet.href || document.baseURI).pathname}")`); clone.replaceWith(style); } } catch {} }
        root.querySelectorAll('script,base,iframe,object,embed,meta[http-equiv],link[rel=modulepreload],link[rel=preload]').forEach(n => n.remove());
        for (const n of root.querySelectorAll('*')) { for (const attr of [...n.attributes]) if (/^on/i.test(attr.name) || attr.name === 'nonce' || attr.name === 'integrity') n.removeAttribute(attr.name); if (n.hasAttribute('href') && /^javascript:/i.test(n.getAttribute('href'))) n.removeAttribute('href'); }
        return '<!doctype html>' + root.outerHTML;
      });
      const digest = createHash('sha256').update(html).digest('hex');
      return { html, digest, version: p.version, width, problems };
    } finally { await context.close(); }
  })();
  r.rendering.set(key, task); task.finally(() => { while (r.rendering.size > 3) r.rendering.delete(r.rendering.keys().next().value); }).catch(() => { r.rendering.delete(key); }); return task;
}
async function api(req, res, body) {
  const url = new URL(req.url, 'http://runner');
  if (req.method === 'GET' && url.pathname === '/status') return json(res, 200, { host: os.hostname(), platform: process.platform, pid: process.pid, codexPid: codex.proc?.pid, node: process.version, codex: codex.info, projects: projects.map(p => ({ id: p.id, name: p.name, dir: p.dir, localProjectId: p.localProjectId })), models: await catalog() });
  if (req.method === 'POST' && url.pathname === '/projects') {
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 160) throw Error('Enter a project name.');
    const roots = [path.join(DATA, 'projects'), ...(config.projectRoots || [])]; roots.forEach(root => fs.mkdirSync(root, { recursive: true }));
    const id = randomUUID(); let dir = path.join(roots[0], id);
    if (body.dir) { const real = fs.realpathSync(body.dir); if (!roots.some(root => { const rel = path.relative(fs.realpathSync(root), real); return !rel.startsWith('..') && !path.isAbsolute(rel); })) throw Error('Existing directory is outside the configured Ares project roots.'); dir = real; }
    fs.mkdirSync(dir, { recursive: true });
    const p = { id, name: body.name.trim(), dir, localProjectId: typeof body.localProjectId === 'string' ? body.localProjectId : null, threadId: null, version: 0, entries: [], requests: {}, turn: null, lastTurn: null };
    projects.push(p); runtime(p); save(); return json(res, 201, summary(p));
  }
  const match = url.pathname.match(/^\/projects\/([a-z0-9-]+)(?:\/(send|stop|approval|render|asset))?$/); if (!match) return json(res, 404, { error: 'Unknown runner action.' });
  const p = project(match[1]), action = match[2], r = runtime(p);
  if (!action && req.method === 'GET') return json(res, 200, summary(p, Math.max(0, Number(url.searchParams.get('after')) || 0)));
  if (action === 'send' && req.method === 'POST') {
    if (!/^[\w-]{16,100}$/.test(body.requestId || '') || typeof body.text !== 'string' || !body.text.trim() || body.text.length > 100000) throw Error('Invalid message request.');
    if (p.requests[body.requestId]) return json(res, 200, { duplicate: true, ...p.requests[body.requestId], project: summary(p) });
    if (p.turn || r.starting) throw Error('A turn is already active. Stop it or wait before sending.');
    r.starting = true; r.cancelRequested = false;
    try {
      const list = await catalog(), model = list.find(m => m.id === body.model); if (!model || (body.effort && !model.efforts.includes(body.effort))) throw Error('Choose an available Ares model and reasoning level.');
      p.model = model.id; p.effort = body.effort || model.defaultEffort; await ensureThread(p);
      p.requests[body.requestId] = { state: 'starting' }; p.turn = { id: null, status: 'starting' }; entry(p, { id: body.requestId, kind: 'user', text: body.text });
      save();
      // Persist before the RPC. An ambiguous transport failure is never automatically resent.
      const result = await codex.request('turn/start', { threadId: p.threadId, cwd: p.dir, model: p.model, effort: p.effort, approvalPolicy: 'on-request', approvalsReviewer: 'user', sandboxPolicy: { type: 'workspaceWrite', writableRoots: [p.dir], networkAccess: true, excludeTmpdirEnvVar: false, excludeSlashTmp: false }, clientUserMessageId: body.requestId, input: [{ type: 'text', text: body.text, text_elements: [] }] });
      if (r.cancelRequested) await codex.request('turn/interrupt', { threadId: p.threadId, turnId: result.turn.id });
      p.requests[body.requestId] = { state: 'accepted', turnId: result.turn.id }; if (p.turn) p.turn.id = result.turn.id; save(); return json(res, 200, { project: summary(p) });
    } catch (e) { if (p.requests[body.requestId]) { p.requests[body.requestId].state = 'uncertain'; p.turn = null; entry(p, { id: randomUUID(), kind: 'error', text: `${e.message} Check the session before sending again.` }); } throw e; } finally { r.starting = false; }
  }
  if (action === 'stop' && req.method === 'POST') {
    r.cancelRequested = true;
    if (p.turn?.id) await codex.request('turn/interrupt', { threadId: p.threadId, turnId: p.turn.id });
    for (const [id, a] of approvalRequests) if (a.projectId === p.id) { a.resolve(a.method.includes('permissions') ? { permissions: {}, scope: 'turn' } : { decision: 'cancel' }); approvalRequests.delete(id); }
    return json(res, 200, summary(p));
  }
  if (action === 'approval' && req.method === 'POST') {
    const a = approvalRequests.get(body.id); if (!a || a.projectId !== p.id) throw Error('This request is no longer pending.');
    if (a.method === 'item/tool/requestUserInput') a.resolve({ answers: body.answers || {} });
    else if (a.method.includes('permissions')) { if (body.decision !== 'decline') throw Error('Extended permission grants are not supported here. Decline and use scoped project commands.'); a.resolve({ permissions: {}, scope: 'turn' }); }
    else { if (!['accept', 'decline', 'cancel'].includes(body.decision)) throw Error('Unsupported approval decision.'); a.resolve({ decision: body.decision }); }
    approvalRequests.delete(a.id); return json(res, 200, summary(p));
  }
  if (action === 'render' && req.method === 'GET') return json(res, 200, await render(p, [1440, 820, 390].includes(Number(url.searchParams.get('width'))) ? Number(url.searchParams.get('width')) : 1440, url.searchParams.get('theme') === 'dark' ? 'dark' : 'light'));
  if (action === 'asset' && req.method === 'GET') {
    const rel = url.searchParams.get('path') || '/';
    publicAssetPath(rel);
    const base = await ensurePreview(p), target = new URL(rel, base); if (target.origin !== new URL(base).origin) throw Error('External preview target.');
    const response = await fetch(target, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
    res.writeHead(response.status >= 300 && response.status < 400 ? 502 : response.status, { 'Content-Type': response.headers.get('content-type') || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(Buffer.from(await response.arrayBuffer())); return;
  }
  return json(res, 405, { error: 'Unsupported action or method.' });
}
// On runner restart, no process is silently restarted and no user turn is duplicated.
for (const p of projects) if (p.turn) { p.lastTurn = { status: 'interrupted', error: 'Ares runner restarted. Resume the preserved session with a follow-up.' }; p.turn = null; } save();
const server = http.createServer(async (req, res) => {
  try {
    // Browser requests are rejected even if someone somehow obtains signed headers.
    if (req.headers.origin || req.headers['sec-fetch-site']) return json(res, 403, { error: 'Runner accepts authenticated connector requests only.' });
    const chunks = []; let size = 0; for await (const chunk of req) { size += chunk.length; if (size > 2 * 1024 * 1024) throw Error('Request too large.'); chunks.push(chunk); } const buffer = Buffer.concat(chunks);
    if (!verify(req.method, req.url, req.headers, buffer)) return json(res, 401, { error: 'Lucid connector authentication required.' });
    await api(req, res, buffer.length ? JSON.parse(buffer.toString()) : {});
  } catch (e) { if (!res.headersSent) json(res, 400, { error: e.message }); else res.end(); }
});
server.on('upgrade', async (req, socket, head) => {
  try {
    if (req.headers.origin || req.headers['sec-fetch-site'] || !verify(req.method, req.url, req.headers, Buffer.alloc(0))) { socket.end('HTTP/1.1 401 Authentication required\r\nConnection: close\r\n\r\n'); return; }
    const url = new URL(req.url, 'http://runner'), match = url.pathname.match(/^\/projects\/([a-z0-9-]+)\/socket$/);
    if (!match) throw Error('Unknown project socket.');
    const p = project(match[1]), base = await ensurePreview(p), rel = publicAssetPath(url.searchParams.get('path') || '/'), target = new URL(rel, base);
    if (target.origin !== new URL(base).origin) throw Error('Invalid socket origin.');
    tunnel(req, socket, head, target, { Origin: new URL(base).origin });
  } catch { socket.destroy(); }
});
server.listen(port, '127.0.0.1', () => console.log(`Lucid Ares runner on 127.0.0.1:${port}, host ${os.hostname()}, node ${process.version}`));
async function shutdown() { for (const r of runtimes.values()) { r.watcher?.close(); clearTimeout(r.watchTimer); r.dev?.kill(); r.devServer?.close(); } codex.proc?.kill(); await closeBrowser(); server.close(); }
process.on('SIGTERM', () => void shutdown()); process.on('SIGINT', () => void shutdown());
