import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transformWithOxc} from 'vite';
const source=await readFile(new URL('../../src/office/thread-list.ts',import.meta.url),'utf8');
const code=(await transformWithOxc(source,'thread-list.ts')).code.replace(/^export /gm,'').replace(/export\s*\{[^}]*\};?/g,'');
const order=new Function(`${code};return completionFirst`)();
const base={runStatus:'running',updatedAt:'2026-11-09T12:00:00Z'};
const input=[{...base,id:'work'},{...base,id:'old',runStatus:'completed'},{...base,id:'new',runStatus:'completed',updatedAt:'2026-11-09T13:00:00Z'},{...base,id:'job',runStatus:'completed',job:{state:'running'}},{...base,id:'ask',runStatus:'completed',question:'Help?'},{...base,id:'idle',runStatus:null},{...base,id:'stale',lastStatus:'completed'}];
assert.deepEqual(order(input).map(t=>t.id),['new','old','work','job','ask','idle','stale']);assert.equal(input[0].id,'work');
console.log('Completion ordering passed: newest replies first, stable other work, questions, background jobs and stale completed runs.');

// Needs you above Working above the rest (Done newest first, then idle); pinned threads stay first;
// T3's order holds inside every group, and moving a thread (Alt+Up/Down, drag) stays in its group.
const [statusFirst,pinnedFirst]=new Function(`${code};return [statusFirst,pinnedFirst]`)();
const tones={w1:'working',d1:'done',n1:'needs',i1:'',w2:'working',n2:'needs',d2:'done',p1:'working',p2:'needs',i2:''};
const rows=Object.keys(tones).map((id,i)=>({id,pinned:id.startsWith('p'),runStatus:tones[id]==='done'?'completed':null,updatedAt:`2026-11-09T1${i}:00:00Z`}));
const view=pinnedFirst(statusFirst(order(rows),t=>tones[t.id])).map(t=>t.id);
assert.deepEqual(view,['p2','p1','n1','n2','w1','w2','d2','d1','i1','i2']);
assert.deepEqual(rows.map(t=>t.id),Object.keys(tones),'T3 order itself is never changed');
const sidebar=await readFile(new URL('../../src/app/thread-sidebar.ts',import.meta.url),'utf8');
assert.ok(/pinnedFirst\(statusFirst\(completionFirst\(list\), t => app\.operationalStatus\(t\)\.tone\)\)/.test(sidebar),'the order uses the shared status');
assert.equal((sidebar.match(/app\.orderThreads\(/g)||[]).length>=3,true,'list, rail and neighbours share the order');
assert.ok(/app\.threadGroup\(x\) === app\.threadGroup\(t\)/.test(sidebar),'Alt+Up/Down moves within the group');
const actions=await readFile(new URL('../../src/app/thread-actions.ts',import.meta.url),'utf8');
assert.ok(/app\.threadGroup\(source\) !== app\.threadGroup\(target\)/.test(actions),'dragging reorders within the group');
console.log('Status grouping passed: pinned, Needs you, Working, Done and idle; stable groups in the list and the rail; moves within a group.');
