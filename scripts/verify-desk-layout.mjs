// Run after `npx vite build`. Uses the app's offscreen screenshot/evaluation path.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { Script } from 'node:vm';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import electron from 'electron';
import assert from 'node:assert/strict';
import { transformWithOxc } from 'vite';
const navigation = await transformWithOxc(await readFile(new URL('../src/office/navigation.ts', import.meta.url), 'utf8'), 'navigation.ts');
const { furniturePath, crosses } = await import('data:text/javascript;base64,' + Buffer.from(navigation.code).toString('base64'));

const obstacle = { x: 100, y: 100, w: 100, h: 80 };
const bounds = { x: 0, y: 0, w: 400, h: 400 };
const path = furniturePath({ x: 40, y: 140 }, { x: 300, y: 140 }, [obstacle], bounds);
assert.ok(path?.length > 1);
let p = { x: 40, y: 140 };
for (const q of path) { assert.equal(crosses(p, q, { x: 84, y: 92, w: 132, h: 96 }), false); p = q; }
assert.equal(furniturePath({ x: 40, y: 140 }, { x: 300, y: 140 }, [{ x: 80, y: -20, w: 140, h: 460 }], bounds), null);

const folder = await mkdtemp(join(tmpdir(), 'lucid-desk-verification-'));
const evaluation = `
(async () => {
  if (window.__deskCheck) { window.__endDeskPreview?.(); return window.__deskCheck; }
  window.__deskCheck = { running: true };
  const w = window.__world, checks = [], assert = (ok, message) => { if (!ok) throw Error(message); checks.push(message); };
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  try {
    const update = w.update.bind(w);
    // Isolate deterministic fixtures from the connected world's three-second refresh.
    w.update = () => {};
    const saveLayout = w.onLayoutChange;
    w.onLayoutChange = () => {};
    w.homes.clear(); w.seats.clear(); w.extra.clear(); w.hidden.clear();
    w.placed.clear(); w.roomOf.clear(); w.hasLayout=false; w.orchThread = '';
    for (const walker of w.transit.values()) walker.destroy(); w.transit.clear(); w.trips.clear();
    const thread = (id, projectId) => ({ id, projectId, title: 'Desk ' + id, provider: 'codex', model: null, updatedAt: new Date().toISOString(), runStatus: 'running', pinned: true, settled: false, question: null });
    let data = { projects: [{ id: 'a', title: 'Navigation', root: '', icon: null, scratch: false }, { id: 'b', title: 'Second project', root: '', icon: null, scratch: false }], threads: [thread('a1','a'), thread('a2','a'), thread('a3','a'), thread('b1','b')] };
    update(data); await wait(400);
    assert(w.rooms.find(r => r.id === 'main').threadIds.length === 0, 'running and pinned threads never autojoin main');
    const before = JSON.stringify([...w.seats]), rooms = JSON.stringify(w.rooms.map(r => [r.id,r.x,r.y,r.w,r.h]));
    const identity = new Map(w.desks);
    data = { ...data, projects: [...data.projects].reverse(), threads: [...data.threads].reverse() };
    update(data); await wait(350);
    assert(JSON.stringify([...w.seats]) === before, 'refresh order preserves reserved seats');
    assert(JSON.stringify(w.rooms.map(r => [r.id,r.x,r.y,r.w,r.h])) === rooms, 'refresh order preserves room geometry');
    assert([...identity].every(([id,d]) => w.desks.get(id) === d), 'refresh preserves desk and computer identity');
    // Exercise pointer handlers, including preview, neighbor motion, cancellation and persistence.
    w.showRoom('p:a'); await wait(1100);
    const desk = w.desks.get('a1'), positions = [...w.slotDesks].filter(([key]) => key.startsWith('p:a#')).sort((a,b)=>Number(a[0].split('#')[1])-Number(b[0].split('#')[1]));
    const dest = positions[2][1], rect = desk.el.getBoundingClientRect(), end = dest.el.getBoundingClientRect();
    const event = (type, x, y) => desk.el.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, pointerId: 77, clientX: x, clientY: y }));
    const x0 = rect.left + 40 * w.cam.s, y0 = rect.top + 200 * w.cam.s;
    event('pointerdown', x0, y0); event('pointermove', x0 + end.left - rect.left, y0);
    assert(document.body.classList.contains('desk-dragging') && !!document.querySelector('.desk-drop-preview'), 'desk drag shows landing preview and blocks selection');
    update(data);
    assert(w.deskDragActive && w.seats.get('p:a').join(',') === 'a1,a2,a3', 'live refresh is deferred during desk drag');
    event('pointerup', x0 + end.left - rect.left, y0); await wait(400);
    assert(w.seats.get('p:a').join(',') === 'a2,a3,a1', 'desk drag inserts rather than swaps neighbors');
    assert(!document.body.classList.contains('desk-dragging') && !document.querySelector('.desk-drop-preview'), 'release removes drag state');
    const saved = JSON.stringify(Object.fromEntries(w.seats));
    saveLayout(); await wait(100);
    assert(JSON.stringify(JSON.parse(window.lucid.settingsLoad()).seats) === saved, 'desk order is saved through Electron settings');
    w.seats = new Map(Object.entries(JSON.parse(saved))); update(data); await wait(350);
    assert(w.seats.get('p:a').join(',') === 'a2,a3,a1', 'serialized seat order survives reload');
    const newRect = desk.el.getBoundingClientRect();
    event('pointerdown', newRect.left + 20, newRect.top + 200 * w.cam.s); event('pointermove', newRect.left - 100, newRect.top + 200 * w.cam.s);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(350);
    assert(w.seats.get('p:a').join(',') === 'a2,a3,a1' && !document.querySelector('.desk-drop-preview'), 'Escape restores order and clears preview');
    let accidentalClick = false;
    const clicked = () => { accidentalClick=true; };
    desk.el.addEventListener('click',clicked);
    window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:77}));
    desk.el.dispatchEvent(new MouseEvent('click',{bubbles:true}));
    desk.el.removeEventListener('click',clicked);
    assert(!accidentalClick,'Escape also suppresses the eventual release click');
    // Confirm a temporary absence leaves furniture in its original reservation.
    const reserved = [...w.seats.get('p:a')], oldDesk = w.desks.get('a2');
    data = { ...data, threads: data.threads.map(t => t.id === 'a2' ? { ...t, question: 'Need a decision' } : t) };
    update(data); await wait(350);
    assert(JSON.stringify(w.seats.get('p:a')) === JSON.stringify(reserved) && w.desks.get('a2') === oldDesk, 'questions retain the same desk reservation');
    assert(oldDesk.el.classList.contains('arriving'), 'away robot is hidden at its reserved desk');
    // Exercise the real sidebar drag handler and its room-list target.
    w.update = next => { if (next.projects.some(p => p.id === 'a')) update(next); };
    const row = document.createElement('button'); row.className = 'th-row'; row.dataset.id = 'a1'; row.textContent = 'Desk a1';
    document.getElementById('th-list').prepend(row);
    row.scrollIntoView({block:'center'}); w.showRoom('main'); await wait(1100);
    const rr = row.getBoundingClientRect(), mr = w.scene.getBoundingClientRect();
    const rowEvent = (type,x,y) => row.dispatchEvent(new PointerEvent(type,{bubbles:true,button:0,pointerId:78,clientX:x,clientY:y}));
    const dropX=mr.left+mr.width/2, dropY=mr.top+mr.height/2;
    rowEvent('pointerdown',rr.left+20,rr.top+12); rowEvent('pointermove',dropX,dropY);
    assert(!!document.querySelector('.office-drop-preview') && document.body.classList.contains('th-dragging'), 'sidebar drag previews office membership drop');
    rowEvent('pointerup',dropX,dropY); row.remove(); await wait(350);
    assert(w.homes.get('a1') === 'main' && w.rooms.find(r => r.id === 'main').threadIds.includes('a1'), 'main membership follows the user drop');
    saveLayout(); await wait(100);
    assert(JSON.parse(window.lucid.settingsLoad()).homes.a1 === 'main', 'user-selected main membership persists in Electron settings');
    assert(w.desks.get('a1').el.classList.contains('arriving') && w.transit.has('a1'), 'office transfer walks instead of showing a seated duplicate');
    assert(w.placeThread('a1','p:a'), 'thread drop removes main membership'); await wait(350);
    assert(!w.rooms.find(r => r.id === 'main').threadIds.includes('a1'), 'main stays empty after user removes the thread');
    const settled = { ...thread('done','a'), runStatus:null, pinned:false, settled:true };
    data = { ...data, threads:[...data.threads,settled] }; update(data);
    assert(w.placeThread('done','p:a') && w.seats.get('p:a').includes('done'), 'user can place a settled thread alongside active threads');
    // Furniture placement and walking use exactly the same purchased decorations.
    w.level=100; w.owns=()=>true;
    w.themes.set('p:a',{decor:['beanbags','pingpong','plants','bookshelf','coffee','water']});
    update(data); await wait(400);
    assert(w.furniture(w.rooms.find(r=>r.id==='p:a')).length > w.seats.get('p:a').length*2,'purchased furniture participates in route collision');
    w.update = () => {};
    // Check every desk approach against the same floor footprints used during travel.
    let segments = 0;
    for (const room of w.rooms.filter(r => ['main','project','freelance'].includes(r.kind))) {
      for (const [key,d] of w.slotDesks) if (key.startsWith(room.id + '#')) {
        const route = w.toSeat(room, w.deskPos(d));
        for (let i=1; i<route.length; i++) {
          const a = route[i-1], b = route[i];
          // Expose routing through walkLegs with a harmless recorder walker.
          const mock = { x:a.x, y:a.y, el:document.createElement('div'), facing:'up', walkPath:async pts => { for (const pt of pts) { assert(!w.furniture(room).some(r => {
            const padded={x:r.x-15,y:r.y-7,w:r.w+30,h:r.h+14};
            let lo=0,hi=1; for(const [p,q] of [[mock.x-pt.x,mock.x-padded.x],[pt.x-mock.x,padded.x+padded.w-mock.x],[mock.y-pt.y,mock.y-padded.y],[pt.y-mock.y,padded.y+padded.h-mock.y]]) { if(p===0){if(q<0)return false;continue;} const t=q/p; if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return false; } return true;
          }), 'approach segment avoids furniture ' + (++segments)); mock.x=pt.x;mock.y=pt.y; } } };
          const trip = {}; w.transit.set('__route-test', mock); w.trips.set('__route-test', trip);
          await w.walkLegs({id:'__route-test'}, [b], trip);
          assert(Math.hypot(mock.x-b.x,mock.y-b.y)<1, 'approach reaches waypoint ' + key + ':' + i + ' ' + JSON.stringify({a,b}));
          w.transit.delete('__route-test'); w.trips.delete('__route-test');
        }
      }
    }
    assert(segments > 15, 'all office desk approaches checked');
    const park = w.park, oldGeometry = park.geo;
    let parkWalks=0, parkSnaps=0;
    const parkWalker = {x:oldGeometry.door.x,y:oldGeometry.door.y,stop:()=>{},setPos:()=>parkSnaps++,walkPath:async pts=>{parkWalks++;const last=pts.at(-1);parkWalker.x=last.x;parkWalker.y=last.y;}};
    const visitor = {t:{id:'__park-test'},w:parkWalker,alive:false,spot:null};
    park.leaving.add(parkWalker);
    await park.go(visitor,{x:oldGeometry.park.x+30,y:oldGeometry.door.y},true);
    park.leaving.delete(parkWalker);
    assert(parkWalks>0,'park departures use the park route even after being marked as leaving');
    park.vis.set('__park-test',visitor);
    const parkBefore={x:parkWalker.x,y:parkWalker.y};
    park.setGeometry({...oldGeometry.park,x:oldGeometry.park.x+100},oldGeometry.door);
    assert(parkSnaps===0 && parkWalker.x===parkBefore.x && parkWalker.y===parkBefore.y,'office growth does not teleport park visitors');
    park.vis.delete('__park-test'); park.setGeometry(oldGeometry.park,oldGeometry.door);
    w.showRoom('p:a'); await wait(800);
    // Leave a real in-progress gesture for shot 2, then clean it up before shot 3.
    const finalRect = desk.el.getBoundingClientRect();
    event('pointerdown',finalRect.left+20,finalRect.top+200*w.cam.s);
    event('pointermove',finalRect.left-180,finalRect.top+200*w.cam.s);
    window.__endDeskPreview = () => { desk.el.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:77})); window.__endDeskPreview=null; };
    window.__deskCheck = { ok:true, checks, segments };
  } catch (error) { window.__deskCheck = {ok:false,error:String(error),stack:error.stack,checks}; }
  return window.__deskCheck;
})()
`;
new Script(evaluation);
const evaluationFile = join(folder, 'evaluation.js');
await writeFile(evaluationFile, evaluation);
const env = { ...process.env, LUCID_SHOT: folder, LUCID_SHOT_PROFILE: join(folder, 'profile'), LUCID_SHOT_COUNT: '3', LUCID_SHOT_EVERY: '10000', LUCID_SHOT_QUIT: '1', LUCID_EVAL_FILE: evaluationFile };
delete env.LUCID_EVAL;
delete env.ELECTRON_RUN_AS_NODE;
await new Promise((resolve, reject) => {
  const child = spawn(electron, ['.'], { env, stdio: 'inherit' });
  child.on('error', reject); child.on('exit', (code) => code === 0 ? resolve() : reject(Error('Electron exited ' + code)));
});
const log = await readFile(join(folder, 'eval.log'), 'utf8');
console.log('Artifacts: ' + folder);
console.log(log.split('--- 2')[0]);
assert.ok(log.includes('"ok": true'), 'offscreen interaction checks passed');
assert.equal(log.includes('"ok": false'), false, 'no offscreen check failed');
