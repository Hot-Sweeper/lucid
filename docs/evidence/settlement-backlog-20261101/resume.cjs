const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = 'E:/T3 Projects/Lucid';
const t3 = require(path.join(root, 'electron/t3.cjs'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const receiptFile = path.join(root, 'docs/evidence/stability-delivery-20261101/combined-delivery.json');
const receiptBytes = fs.readFileSync(receiptFile);
const receipt = JSON.parse(receiptBytes);
const targets = [
  {id: '07679d200ba5aa130dd3ce46', threadId: 'mcp:8277ddb1-faf9-41ac-adeb-d88d99c0e5ff', files: ['electron/profiler.cjs']},
  {id: 'f10814aad46248d7b7863bf8', threadId: '0c98eaba-2881-4a48-be98-1d32d8f369c8', files: ['src/office/chat-panel.ts', 'electron/conversation.cjs']},
];
async function main() {
  for (const target of targets) {
    const state = t3.reportState(target.threadId);
    if (state.pinned || state.settled || state.pendingRuns || state.pendingRequests || state.run?.status !== 'completed') throw Error('Target is not eligible for re-review: ' + target.threadId);
    for (const file of target.files) {
      if (!receipt.acceptedSourceParity.some(p => p.file === file && p.matches && p.acceptedSha256 === p.validatedSha256)) throw Error('Accepted delivery source missing: ' + file);
      if (file.startsWith('electron/') && !receipt.mainProof.modules.some(p => p.file === file && p.match && p.executingSha256 === p.validatedSha256)) {
        // The conversation module is represented by the validated renderer/main delivery receipt,
        // rather than claiming a separate module-level V8 capture for it.
        if (file !== 'electron/conversation.cjs') throw Error('Executing main proof missing: ' + file);
      }
    }
  }
  const port = fs.readFileSync(path.join(process.env.APPDATA, 'lucid/DevToolsActivePort'), 'utf8').split(/\r?\n/)[0];
  const pages = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  const page = pages.find(p => p.type === 'page' && p.url.includes('/dist/index.html'));
  if (!page) throw Error('Existing normal app required');
  const ws = new WebSocket(page.webSocketDebuggerUrl), pending = new Map();
  let seq = 0;
  ws.onmessage = e => {const d = JSON.parse(e.data); const p = pending.get(d.id); if (p) {pending.delete(d.id); d.error ? p.reject(Error(d.error.message)) : p.resolve(d.result);}};
  await new Promise((resolve, reject) => {ws.onopen = resolve; ws.onerror = reject;});
  const call = (method, params) => new Promise((resolve, reject) => {const id = ++seq; pending.set(id, {resolve, reject}); ws.send(JSON.stringify({id, method, params}));});
  const js = async expression => {const r = await call('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true}); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value;};
  const audit = {at: new Date().toISOString(), receipt: {path: receiptFile, sha256: sha(receiptBytes), recordedAt: receipt.recordedAt}, method: 'Existing Lucid reportsManual retry IPC, followed by normal reportsTick; no direct archive write, worker message, restart or promotion', targets: []};
  try {
    for (const target of targets) {
      const before = await js(`lucid.reportsList().then(ps => {const p=ps.find(p=>p.id===${JSON.stringify(target.id)}); return p ? {id:p.id,threadId:p.threadId,runId:p.runId,status:p.status,images:p.images.map(i=>i.hash)} : null})`);
      if (before?.status !== 'pending-dependency' || before.threadId !== target.threadId || before.runId !== t3.reportState(target.threadId).run.id) throw Error('Report changed before retry');
      const after = await js(`lucid.reportsManual(${JSON.stringify(target.id)},'retry').then(p=>({id:p.id,status:p.status,images:p.images.map(i=>i.hash)}))`);
      audit.targets.push({threadId: target.threadId, before, after});
    }
    await js('lucid.reportsTick([]).then(()=>true)');
    fs.writeFileSync(path.join(__dirname, 'resumed.json'), JSON.stringify(audit, null, 2));
    console.log(JSON.stringify(audit));
  } finally {ws.close();}
}
main().catch(e => {console.error(e); process.exitCode = 1;});
