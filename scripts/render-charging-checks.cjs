// Run inside the delivery owner's isolated Electron fixture with {js,wc,wait,out}.
// No provider commands, real thread mutations, app restart or production promotion.
const fs = require('node:fs');
const path = require('node:path');
module.exports = async ({ js, wc, wait, out }) => {
  const checks = [];
  const check = (ok, name) => { if (!ok) throw Error(name); checks.push(name); };
  await js(`{
    const world=window.__world, existing=world.ext.charging;
    if(!existing)throw Error('Charging room not mounted');
    window.__chargingOriginalUpdate=world.update;world.update=()=>{};
    const now=Date.now(), reset=new Date(now+3661000).toISOString();
    world.setUsage({limits:{'t3:claudeAgent':{harness:'claude',name:'Claude',observedAt:new Date(now).toISOString(),primary:null,secondary:null,windows:[{id:'weekly',usedPercent:100,windowMinutes:10080,resetsAt:reset,observedAt:new Date(now-3600000).toISOString()}]}}});
    const roomRect=world.rooms.find(r=>r.id==='charging');
    const host=window.__chargingHost=document.createElement('div');host.className='room room-charging';host.style.cssText='position:absolute;left:'+roomRect.x+'px;top:'+roomRect.y+'px;width:1500px;height:1730px';
    world.roomLayer.append(host);existing.el.style.visibility='hidden';
    const room=window.__chargingFixture=new existing.constructor(host,1500,1730);
    const battery={remaining:0,charging:true,name:'Claude',windows:[{label:'Weekly',resetsAt:now+3661000,startedAt:now-3600000}]};
    const list=window.__chargingList=Array.from({length:25},(_,i)=>({id:'charging-fixture-'+i,provider:'claudeAgent',name:i===0?'A deliberately long robot name':'Robot '+(i+1),title:'Charging test',battery}));
    room.setThreads(list);room.setThreads(list);
    // Accelerate only fixture travel, retaining real routing, pose and handoff code.
    for(const r of room.residents.values())r.w.speed=1800;
    world.stopCameraMotion();world.unfocus(false);world.cam=world.fitTarget({x:roomRect.x,y:roomRect.y,w:1500,h:1730},20,world.scene.clientWidth,world.scene.clientHeight);world.apply();
  }`);
  try {
    let state;
    for (let i = 0; i < 24; i++) {
      await wait(500);
      state = await js(`({count:window.__chargingFixture.residents.size,docked:[...window.__chargingFixture.residents.values()].filter(r=>!r.label.hidden).length,actors:window.__chargingFixture.el.querySelectorAll('.world-walker').length})`);
      if (state.docked === 25) break;
    }
    check(state.count === 25 && state.actors === 25 && state.docked === 25, '25 unique robots reach charging docks without leisure cap');
    check(await js(`window.__chargingFixture.el.querySelectorAll('.charging-station').length>=25&&window.__chargingFixture.el.querySelectorAll('.charging-pad').length>=25`), 'every dock has an upright charging station and circular contact pad');
    check(await js(`!!window.__chargingFixture.el.querySelector('.charging-power-bank')&&!!window.__chargingFixture.el.querySelector('.charging-tool-trolley')&&!!window.__chargingFixture.el.querySelector('.charging-spare-cells')`), 'industrial power cabinets, tool trolley and spare batteries are present');
    state = await js(`{const r=window.__chargingFixture.residents.values().next().value;({text:r.time.textContent,progress:r.meter.value,quota:r.w.activity==='charge',weakness:r.w.weakness,overflow:[...window.__chargingFixture.residents.values()].some(q=>q.label.offsetLeft<16||q.label.offsetLeft+q.label.offsetWidth>1484)})}`);
    check(/^1h (?:0|1)m \d\ds until reset$/.test(state.text), 'hours, minutes and ticking seconds visible');
    check(state.progress > .45 && state.progress < .55, 'progress reflects elapsed subscription reset wait');
    check(state.quota && state.weakness === 1, 'exhausted robots use charging pose and low energy motion');
    check(!state.overflow, 'station readouts stay inside room walls');
    fs.writeFileSync(path.join(out, 'charging-populated.png'), (await wc.capturePage()).toPNG());
    await js(`{const w=window.__world,r=w.rooms.find(r=>r.id==='charging');w.cam=w.fitTarget({x:r.x+20,y:r.y+80,w:1460,h:600},20,w.scene.clientWidth,w.scene.clientHeight);w.apply();}`);
    await wait(300);
    fs.writeFileSync(path.join(out, 'charging-stations-close.png'), (await wc.capturePage()).toPNG());
    await js(`{const r=window.__chargingFixture.residents.values().next().value;r.info.battery={remaining:0,charging:true,name:'Claude',windows:[{label:'Weekly',resetsAt:null,startedAt:Date.now()}]};window.__chargingFixture.paint();}`);
    state = await js(`{const r=window.__chargingFixture.residents.values().next().value;({text:r.time.textContent,hidden:r.meter.hidden})}`);
    check(state.hidden && state.text === 'Reset time unavailable', 'unknown reset time does not invent a timer or percentage');
    await js(`{window.__chargingExits=0;window.__chargingFixture.onExit=()=>{window.__chargingExits++;return true};window.__chargingFixture.setThreads([]);}`);
    for (let i = 0; i < 24; i++) { await wait(500); if (await js('window.__chargingFixture.residents.size===0')) break; }
    check(await js('window.__chargingFixture.residents.size===0&&window.__chargingExits===25'), 'all robots hand over once on recovery');
    fs.writeFileSync(path.join(out, 'charging-native.json'), JSON.stringify({ checks, state }, null, 2));
    return { checks };
  } catch (error) {
    fs.writeFileSync(path.join(out, 'charging-native-failure.json'), JSON.stringify({ checks, error: String(error.stack || error) }, null, 2));
    try { fs.writeFileSync(path.join(out, 'charging-failure.png'), (await wc.capturePage()).toPNG()); } catch {}
    throw error;
  } finally {
    await js(`{const room=window.__chargingFixture;room.destroy();window.__chargingHost.remove();window.__world.ext.charging.el.style.visibility='';window.__world.update=window.__chargingOriginalUpdate;void 0;}`);
  }
};
