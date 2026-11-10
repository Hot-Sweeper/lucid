// Read-only native verification of connected buildings and their actual worlds.
// Uses an isolated Lucid profile and starts no provider tasks.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');

if (!process.versions.electron) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-buildings-'));
  const env = { ...process.env, LUCID_SHOT: out, LUCID_SHOT_PROFILE: path.join(out, 'profile'), LUCID_SHOT_EVERY: '3600000' };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = require('node:child_process').spawn(require('electron'), [__filename, out], { env, stdio: 'inherit', windowsHide: true });
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
} else {
  const { app, BrowserWindow } = require('electron');
  const out = process.argv[2];
  app.setPath('userData', path.join(app.getPath('appData'), 'lucid'));
  require('../../electron/main.cjs');
  // Disable supervision only in this verification copy of the user's profile.
  const settingsFile = path.join(app.getPath('userData'), 'settings.json');
  let settings = {}; try { settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8')); } catch {}
  fs.writeFileSync(settingsFile, JSON.stringify({ ...settings, orch: null }));
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const result = { checks: [], buildings: [], providerTasksStarted: 0 };
  const check = (ok, label) => { assert(ok, label); result.checks.push(label); };
  const watchdog = setTimeout(() => { console.error('Building verification timed out.'); app.exit(1); }, 120000);
  app.whenReady().then(async () => {
    try {
      let win;
      for (let i = 0; i < 200; i++) {
        win = BrowserWindow.getAllWindows()[0];
        if (win && !win.webContents.isLoading()) break;
        await pause(100);
      }
      if (!win) throw Error('Lucid window did not open.');
      const js = code => win.webContents.executeJavaScript(code, true);
      const until = async code => {
        for (let i = 0; i < 300; i++) { if (await js(code)) return; await pause(100); }
        throw Error('Building state did not arrive: ' + code);
      };
      await until('!!window.__world?.lastData && !!document.querySelector(".environment-row")');
      const inventory = await js('window.lucid.environments(true)');
      check(!inventory.error, 'live T3 Connect inventory loads');
      const listed = await js('[...document.querySelectorAll(".environment-row b")].map(b=>b.textContent)');
      check(inventory.buildings.every(b => listed.includes(b.label)), 'every connected computer appears in Buildings');
      check(await js('!document.querySelector(".environments .link-btn").hidden'), 'Refresh is available without a discovery error');
      for (const building of inventory.buildings.filter(b => !b.local && b.canOpen)) {
        const index = inventory.buildings.indexOf(building);
        await js(`document.querySelectorAll('.environment-row')[${index}].click();void 0`);
        await until(`window.__world.lastData?.environmentId===${JSON.stringify(building.id)}`);
        await until(`document.querySelectorAll('.environment-row')[${index}].getAttribute('aria-current')==='location'`);
        const state = await js(`({ label: document.querySelector('.building-plate b').textContent, projects: window.__world.lastData.projects.length, threads: window.__world.lastData.threads.length, scoped: window.__world.lastData.threads.every(t=>t.id.startsWith(${JSON.stringify(building.id + '::')})) })`);
        check(state.label === building.label && state.scoped, `${building.label} opens its own building and scoped thread identities`);
        result.buildings.push({ label: building.label, ...state });
        fs.writeFileSync(path.join(out, `building-${index}.png`), (await win.webContents.capturePage()).toPNG());
      }
      const localIndex = inventory.buildings.findIndex(b => b.local);
      await js(`document.querySelectorAll('.environment-row')[${localIndex}].click();void 0`);
      await until('window.__world.lastData && !window.__world.lastData.environmentId');
      check(await js('!window.__world.lastData.environmentId'), 'returning to this computer restores its local world');

      await until("!!document.querySelector('.neighbor-building[data-projects] .desk-unit')");
      const campus = await js(`({ active: window.__world.lastData.environmentId || null, computers: [...document.querySelectorAll('.neighbor-building')].map(el=>({label:el.querySelector('.neighbor-open').textContent,projects:Number(el.dataset.projects),sessions:Number(el.dataset.sessions),desks:el.querySelectorAll('.desk-unit').length,workers:el.querySelectorAll('.world-walker,.desk-unit:not(.vacant)').length})) })`);
      check(!campus.active && campus.computers.every(b=>b.projects>0 && b.sessions>0 && b.desks>0), 'remote projects, sessions and rendered desks coexist with the active local office');
      check(await js("!document.querySelector('.neighbor-roof')"), 'remote office has visible rooms instead of a roof');
      result.campus=campus;
      const direct=await js(`(async()=>{const inventory=await window.lucid.environments();const remote=inventory.buildings.find(b=>!b.local&&b.canOpen);const before=window.__world.lastData.environmentId||null;const data=await window.lucid.buildingWorld(remote.id);let rejected=false;try{await window.lucid.buildingWorld('missing-computer')}catch{rejected=true}return {before,after:window.__world.lastData.environmentId||null,projects:data.projects.length,sessions:data.threads.length,scoped:data.threads.every(t=>t.id.startsWith(remote.id+'::')),rejected}})()`);
      check(!direct.before&&!direct.after&&direct.scoped&&direct.rejected&&direct.projects>0, 'direct authenticated remote read preserves local action scope and rejects unknown computers');
      const office = await js(`(()=>{const entry=[...window.__world.neighbors.values()].find(e=>e.office?.lastData.environmentId);const office=entry.office;const workers=[...office.desks.values()].filter(d=>d.threadId);return {workers:workers.length,ids:workers.map(d=>d.threadId),x:entry.x,w:office.size.w,h:office.size.h}})()`);
      check(office.workers>0 && office.ids.every(id=>id.includes('::')), 'remote workers belong to actual namespaced remote sessions');
      await js(`window.__world.flyTo({x:${office.x},y:0,w:${office.w},h:${office.h}},30,.1);void 0`);await pause(400);
      check(await js("[...window.__world.neighbors.values()].some(e=>e.office && [...e.office.desks.values()].some(d=>d.threadId&&!d.el.classList.contains('culled')))"), 'zooming into the remote building keeps actual workers and desks visible');
      fs.writeFileSync(path.join(out, 'remote-office.png'), (await win.webContents.capturePage()).toPNG());
      await js('window.__world.overview();void 0');
      await pause(1200);
      check(await js(`document.querySelectorAll('.neighbor-building').length === ${inventory.buildings.length - 1}`), 'each other computer has one neighboring building');
      check(await js("(async()=>{const inv=await window.lucid.environments();const labels=inv.buildings.filter(b=>!b.local).map(b=>b.label);return labels.length>0&&labels.every(l=>[...document.querySelectorAll('.neighbor-open')].some(b=>b.textContent===l));})()"), 'every linked computer has a physical neighboring entrance on the local grounds');
      fs.writeFileSync(path.join(out, 'campus.png'), (await win.webContents.capturePage()).toPNG());

      // Exercise real quiet-office controls while both authenticated worlds coexist.
      const quiet = await js(`(()=>{const world=window.__world;const entry=[...world.neighbors.values()].find(e=>e.office);const office=entry.office;const room=office.rooms.find(r=>r.kind==='project'&&r.collapsed);if(!room)throw Error('No quiet remote office available');window.__layoutReview={id:room.id,environment:office.lastData.environmentId,seats:JSON.stringify([...office.seats])};const control=room.el.querySelector('.room-size-hit');control.focus();control.click();return {id:room.id,environment:office.lastData.environmentId}})()`);
      await until(`(()=>{const e=window.__world.neighbors.get(${JSON.stringify(quiet.environment)});return e?.office.rooms.some(r=>r.id===${JSON.stringify(quiet.id)}&&!r.collapsed)})()`);
      check(await js(`(()=>{const o=window.__world.neighbors.get(${JSON.stringify(quiet.environment)}).office;return o.isRoomExpanded(${JSON.stringify(quiet.id)})&&document.activeElement.classList.contains('room-size-hit')&&document.activeElement.getAttribute('aria-expanded')==='true'})()`), 'The remote open control expands a quiet office and retains keyboard focus');
      await pause(500);
      const transitions = await js(`(()=>{const o=window.__world.neighbors.get(${JSON.stringify(quiet.environment)}).office;return {tweens:o.roomTweens.size,ghosts:o.retiringRooms.size,seats:JSON.stringify([...o.seats])===window.__layoutReview.seats}})()`);
      check(transitions.tweens===0&&transitions.ghosts===0&&transitions.seats, 'room transitions finish and release outgoing artwork without changing saved seats');
      await js(`(()=>{const o=window.__world.neighbors.get(${JSON.stringify(quiet.environment)}).office;const r=o.rooms.find(r=>r.id===${JSON.stringify(quiet.id)});r.el.querySelector('.room-sign-hit').click()})()`);await pause(600);
      check(await js(`(()=>{const w=window.__world,e=w.neighbors.get(${JSON.stringify(quiet.environment)}),r=e.office.rooms.find(r=>r.id===${JSON.stringify(quiet.id)}),c=w.cameraState();return Math.abs((e.x+r.x+r.w/2)*c.s+c.x-w.scene.clientWidth/2)<40})()`), 'neighbor room sign frames that office with the shared camera');
      fs.writeFileSync(path.join(out, 'remote-expanded-office.png'), (await win.webContents.capturePage()).toPNG());
      const rapid=await js(`(()=>{const o=window.__world.neighbors.get(${JSON.stringify(quiet.environment)}).office;for(let i=0;i<12;i++)o.rooms.find(r=>r.id===${JSON.stringify(quiet.id)}).el.querySelector('.room-size-hit').click();return {pinned:o.isRoomExpanded(${JSON.stringify(quiet.id)}),bounded:o.retiringRooms.size<=o.rooms.length}})()`);
      check(rapid.pinned&&rapid.bounded, 'rapid repeated toggles keep the latest choice and bound retiring artwork');await pause(600);
      await js(`document.querySelectorAll('.environment-row')[${inventory.buildings.findIndex(b=>b.id===quiet.environment)}].click();void 0`);
      await until(`window.__world.lastData.environmentId===${JSON.stringify(quiet.environment)}`);
      check(await js(`window.__world.isRoomExpanded(${JSON.stringify(quiet.id)})`), 'opening the remote building retains its in-world expansion choice');
      await until(`document.querySelectorAll('.environment-row')[${inventory.buildings.findIndex(b=>b.id===quiet.environment)}].getAttribute('aria-current')==='location'`);
      await js(`document.querySelectorAll('.environment-row')[${localIndex}].click();void 0`);
      await until('window.__world.lastData && !window.__world.lastData.environmentId');
      await until(`window.__world.neighbors.get(${JSON.stringify(quiet.environment)})?.office?.isRoomExpanded(${JSON.stringify(quiet.id)})`);
      check(await js(`(()=>{const saved=JSON.parse(window.lucid.settingsLoad());return saved.buildingLayouts[${JSON.stringify(quiet.environment)}].expandedRooms.includes(${JSON.stringify(quiet.id)})&&!saved.expandedRooms.includes(${JSON.stringify(quiet.id)})})()`), 'remote layout persists separately from the local layout');
      // Real Chromium reduced-motion emulation must remove cosmetic fold tweens.
      win.webContents.debugger.attach('1.3');
      await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
      const reduced=await js(`(()=>{const o=window.__world.neighbors.get(${JSON.stringify(quiet.environment)}).office;o.setRoomExpanded(${JSON.stringify(quiet.id)},false);const r=o.rooms.find(r=>r.id===${JSON.stringify(quiet.id)});return {folded:r.collapsed,tweens:o.roomTweens.size,ghosts:o.retiringRooms.size}})()`);
      check(reduced.folded&&reduced.tweens===0&&reduced.ghosts===0, 'reduced motion folds immediately with no cosmetic tween or retained artwork');
      await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[]});win.webContents.debugger.detach();

      const localRoom=await js(`(()=>{const w=window.__world,r=w.rooms.find(r=>r.kind==='project'&&r.collapsed);if(!r)throw Error('No quiet local room');window.__localLayoutReview={id:r.id,seats:JSON.stringify([...w.seats]),desks:new Map(w.desks),rooms:new Map(w.rooms.filter(x=>x.id!==r.id).map(x=>[x.id,x.el]))};w.flyTo({x:r.x-30,y:r.y-30,w:r.w+60,h:r.h+60},30,.1);return r.id})()`);
      await pause(300);win.focus();win.webContents.focus();
      await js(`window.__world.rooms.find(r=>r.id===${JSON.stringify(localRoom)}).el.querySelector('.room-size-hit').focus();void 0`);
      check(await js(`document.activeElement===window.__world.rooms.find(r=>r.id===${JSON.stringify(localRoom)}).el.querySelector('.room-size-hit')`), 'visible office size control accepts keyboard focus');
      win.webContents.sendInputEvent({type:'keyDown',keyCode:'Return'});win.webContents.sendInputEvent({type:'char',keyCode:'\r'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Return'});
      await until(`window.__world.isRoomExpanded(${JSON.stringify(localRoom)})`);await pause(500);
      check(await js(`(()=>{const w=window.__world,s=window.__localLayoutReview;return JSON.stringify([...w.seats])===s.seats&&[...s.desks].every(([id,d])=>w.desks.get(id)===d)&&[...s.rooms].every(([id,el])=>w.rooms.find(r=>r.id===id)?.el===el)})()`), 'native Enter expands a local office while preserving working desks, reservations and unchanged room artwork');
      const overlap=await js(`(()=>{const worlds=[window.__world,...[...window.__world.neighbors.values()].flatMap(e=>e.office?[e.office]:[])];return worlds.every(w=>w.rooms.every((a,i)=>w.rooms.slice(i+1).every(b=>a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y)))})()`);
      check(overlap, 'expanded and collapsed rooms never overlap in either building');
      win.setSize(1000,760);await pause(400);
      await js(`window.__world.showRoom(${JSON.stringify(localRoom)});void 0`);await pause(1100);
      check(await js(`(()=>{const r=window.__world.rooms.find(r=>r.id===${JSON.stringify(localRoom)}),button=r.el.querySelector('.room-size-hit'),b=button.getBoundingClientRect(),s=window.__world.scene.getBoundingClientRect();return b.width>0&&b.left>=s.left&&b.right<=s.right&&b.top>=s.top&&b.bottom<=s.bottom})()`), 'office size control remains reachable in a narrow native window');
      await js(`window.__world.setRoomExpanded(${JSON.stringify(localRoom)},false);void 0`);await pause(500);
      win.setSize(1600,960);

      // Mount the same source in an isolated DOM fixture to exercise refresh races
      // and a connection that becomes openable after its row was first created.
      const source = fs.readFileSync(path.join(__dirname, '../../src/office/environments.ts'), 'utf8').replace('import "./environments.css";', '').replace('export function mountEnvironments', 'function mountEnvironments');
      const compiled = require('node:module').stripTypeScriptTypes(source).replace(/export\s*\{\s*\};?/g, '') + '\nexports.mountEnvironments=mountEnvironments;';
      const fixture = await js(`(async()=>{
        const exports={};${compiled}
        const host=document.createElement('div');host.hidden=true;document.body.append(host);
        const flush=()=>new Promise(r=>setTimeout(r,0));
        let finishLoad, finishSelect, calls=0, active=0, maxActive=0, selected=[];
        let data={localId:'local',buildings:[{id:'local',label:'This PC',local:true,status:'reachable',canOpen:true,reason:null},{id:'remote',label:'Remote',local:false,status:'unknown',canOpen:false,reason:'Unavailable'}],error:null,connectionState:'available'};
        let delayed=false,failLoad=false;
        const ui=exports.mountEnvironments(host,async fresh=>{calls++;active++;maxActive=Math.max(maxActive,active);if(delayed)await new Promise(r=>finishLoad=r);active--;if(failLoad)throw Error('temporary');return structuredClone(data)},async id=>{selected.push(id);await new Promise(r=>finishSelect=r)});
        try{
          await flush();
          if(!host.querySelectorAll('.environment-row')[1].disabled)throw Error('Unavailable building is enabled');
          data.buildings[1].canOpen=true;data.buildings[1].reason=null;
          await ui.refresh(true);
          const remote=host.querySelectorAll('.environment-row')[1];remote.click();await flush();
          if(!remote.disabled||selected.join()!=='remote')throw Error('Opening state did not acknowledge selection');
          await ui.refresh(true);if(!remote.disabled)throw Error('Refresh re-enabled an opening building');
          finishSelect();await flush();
          if(remote.disabled||remote.getAttribute('aria-current')!=='location')throw Error('Refreshed row used stale connection state');
          data.buildings.reverse();await ui.refresh(true);
          if(host.querySelector('.environment-row')!==remote)throw Error('Refresh replaced the selected row');
          failLoad=true;await ui.refresh(true);failLoad=false;
          if(host.querySelectorAll('.environment-row').length!==2||host.querySelector('.environment-note').hidden)throw Error('Failed refresh discarded buildings or hid its error');
          delayed=true;const before=calls,pending=ui.refresh(true),duplicate=ui.refresh(true);
          if(calls!==before+1||maxActive!==1)throw Error('Inventory refreshes overlapped');
          finishLoad();await Promise.all([pending,duplicate]);
          const disposed=ui.refresh(true);ui.destroy();finishLoad();await disposed;
          if(host.children.length)throw Error('Disposed inventory rendered late results');
          return true;
        }catch(e){ui.destroy();host.remove();throw e}
        finally{ui.destroy();host.remove()}
      })()`);
      check(fixture, 'native DOM: refreshed connection state, stable rows, opening state, failure retention, coalesced polling and disposal');
      result.ok = true;
    } catch (error) { result.ok = false; result.error = error.stack || error.message; }
    finally {
      clearTimeout(watchdog);
      fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2));
      console.log(JSON.stringify({ ...result, evidence: out }, null, 2));
      app.exit(result.ok ? 0 : 1);
    }
  });
}
