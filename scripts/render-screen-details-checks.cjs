// Opt in through LUCID_SCREEN_DETAILS_CHECKS=1 on render-profile.cjs.
// Exercises production desk apps with fixture-only reads. Never sends an approval or trade.
const fs = require('node:fs');
const path = require('node:path');

module.exports = async ({ js, wc, wait, out }) => {
  const result = { checks: [], marketRequests: [], provenance: 'Injected local market responses, no external network verification.' };
  const save = () => fs.writeFileSync(path.join(out, 'screen-details-checks.json'), JSON.stringify(result, null, 2));
  const shot = async name => fs.writeFileSync(path.join(out, `${name}.png`), (await wc.capturePage()).toPNG());
  const check = (ok, message) => { result.checks.push({ message, passed: !!ok }); save(); if (!ok) throw Error(message); };
  const until = async (code, message, timeout = 6000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) { if (await js(code)) return; await wait(60); }
    throw Error(message);
  };
  // Restore the exact production market registrations after this isolated runtime check.
  const { ipcMain } = require('electron');
  const market = require('../electron/market.cjs');
  let offline = false;
  const last = 12345.67;
  const candles = Array.from({ length: 30 }, (_, i) => ({ t: Date.now() - (30 - i) * 60000, o: last - 30 + i, h: last - 27 + i, l: last - 32 + i, c: i === 29 ? last : last - 29 + i }));
  ipcMain.removeHandler('market:klines'); ipcMain.removeHandler('market:price');
  ipcMain.handle('market:klines', (_e, symbol, interval) => {
    result.marketRequests.push({ method: 'klines', symbol, interval, offline });
    return offline ? { ok: false, error: 'Fixture network offline' } : { ok: true, value: { source: 'Fixture public feed', candles } };
  });
  ipcMain.handle('market:price', (_e, symbol) => {
    result.marketRequests.push({ method: 'price', symbol, offline });
    return offline ? { ok: false, error: 'Fixture network offline' } : { ok: true, value: { source: 'Fixture public feed', price: last } };
  });
  try {
    await js(`{
      const w=window.__world,d=w.desks.get('perf-t0')||[...w.desks.values()].find(x=>x.threadId);
      if(!d)throw Error('Screen checks need an occupied fixture desk');
      window.__screenDetails={d,info:d.director.info,prefs:d.wm.prefs,speed:d.wm.speed,random:Math.random,uacDeps:d.director.uac.deps,host:d.director.idleLife.host};
      window.__screenDetails.sameIcon=(id,node)=>{const t=document.createElement('template');t.innerHTML=d.wm.iconOf(id);return !!node && node.isEqualNode(t.content.firstElementChild)};
      Math.random=()=>0.1;
      d.director.reset();d.wm.speed=30;d.wm.prefs={...d.wm.prefs,windows:'fullscreen'};
      w.stopFollow();w.cam={s:2,x:w.scene.clientWidth/2-(parseFloat(d.el.style.left)+200)*2,y:w.scene.clientHeight/2-(parseFloat(d.el.style.top)+160)*2};w.apply();
      const c=document.createElement('canvas');c.width=320;c.height=180;const g=c.getContext('2d');g.fillStyle='#294777';g.fillRect(0,0,320,180);g.fillStyle='#ffd27a';g.fillRect(60,30,200,120);window.__screenDetails.photo=c.toDataURL();
      const a=document.createElement('canvas');a.width=768;a.height=96;const p=a.getContext('2d');
      for(let i=0;i<8;i++){const x=i*96;p.fillStyle='#f2e8d8';p.beginPath();p.roundRect(x+30,14,36,28,10);p.fill();p.fillStyle='#1c2150';p.fillRect(x+36,23,24,10);p.fillStyle='#6e7bd8';p.fillRect(x+32,44,32,30);p.strokeStyle='#f2e8d8';p.lineWidth=6;p.lineCap='round';p.beginPath();p.moveTo(x+63,48);p.lineTo(x+76,38+Math.sin(i/8*Math.PI*2)*8);p.stroke();}
      window.__screenDetails.sheet=a.toDataURL();
    }`);
    // ToolApp is the same path used when Director receives a viewed image.
    await js(`(async()=>{const f=window.__screenDetails;await f.d.director.tool.picture('fixture-landscape.png',f.photo)})()`);
    result.photo = await js(`{const f=window.__screenDetails,d=f.d,w=d.wm.wins.get('photos');({title:w?.title.textContent,imageLoaded:!!w?.body.querySelector('img')?.naturalWidth,windowIcon:f.sameIcon('photos',w?.el.querySelector('.win-bar > svg')),dockIcon:f.sameIcon('photos',d.wm.dock.querySelector('[data-app="photos"] svg')),classes:w?.el.className})}`);
    check(result.photo.imageLoaded && result.photo.title === 'fixture-landscape.png', 'Production Photos viewer displays the local image');
    check(result.photo.windowIcon && result.photo.dockIcon, 'Photos window and dock use the Photos icon');
    // maximize() uses geometry and remembers the old frame, rather than a CSS marker.
    check(await js(`{const w=window.__screenDetails.d.wm.wins.get('photos');parseFloat(w.el.style.width)>=800 && parseFloat(w.el.style.height)>=400}`), 'Forced fullscreen Photos path maximizes the Photos window');
    await shot('screen-details-photos');
    await js(`(async()=>{const f=window.__screenDetails;await f.d.director.tool.picture('fixture-walk-cycle-sheet.png',f.sheet,async()=>f.sheet)})()`);
    result.player = await js(`{const f=window.__screenDetails,d=f.d,w=d.wm.wins.get('player');({title:w?.title.textContent,content:!!w?.body.querySelector('.sheet'),windowIcon:f.sameIcon('player',w?.el.querySelector('.win-bar > svg')),dockIcon:f.sameIcon('player',d.wm.dock.querySelector('[data-app="player"] svg')),text:w?.body.textContent})}`);
    check(result.player.content && result.player.title === 'fixture-walk-cycle-sheet.png' && result.player.windowIcon && result.player.dockIcon, 'Animated local image opens Player with its own window and dock icons');
    await shot('screen-details-player');
    // Inject only the existing UacPrompt read dependencies. There is no respond method.
    await js(`(async()=>{
      const f=window.__screenDetails,u=f.d.director.uac;u.reset();f.open=[];f.outcome=null;
      u.deps={pending:async()=>f.open,outcome:async()=>f.outcome};
      await u.sync('fixture-screen','missing',{name:'Fixture robot',harness:'Codex'});
    })()`);
    check(await js(`!window.__screenDetails.d.director.uac.isUp`), 'A nonpending approval never creates a screen permission prompt');
    await js(`(async()=>{const f=window.__screenDetails;f.open=[{id:'fixture-approval',type:'approval',requestKind:'command',prompt:'Read the local fixture file',options:[{decision:'decline',label:'Decline',warning:null},{decision:'accept',label:'Approve',warning:null}]}];await f.d.director.uac.sync('fixture-screen','fixture-approval',{name:'Fixture robot',harness:'Codex'})})()`);
    await wait(700);
    check(await js(`{const u=window.__screenDetails.d.wm.root.querySelector('.uac');!!u && u.textContent.includes('Read the local fixture file') && u.textContent.includes('Answer in this robot') && !u.querySelector('button')}`), 'A pending fixture approval shows the real read-only robot permission prompt');
    await shot('screen-details-permission-pending');
    await js(`(async()=>{const f=window.__screenDetails;f.open=[];f.outcome={status:'resolved',decision:'decline'};await f.d.director.uac.poll('fixture-screen')})()`);
    check(await js(`!!window.__screenDetails.d.wm.root.querySelector('.uac-no.pressed') && !window.__screenDetails.d.wm.root.querySelector('.uac-yes.pressed')`), 'Permission settlement reflects the fixture outcome without making a decision');
    await shot('screen-details-permission-resolved'); await wait(1200);
    check(await js(`!window.__screenDetails.d.wm.root.querySelector('.uac')`), 'Settled permission prompt clears from the robot screen');
    // Use the real leisure launch path, with controlled choice and normal app timing.
    // Keep host sleeps at real time so each provenance state can be inspected before the next action.
    await js(`{
      const f=window.__screenDetails,idle=f.d.director.idleLife;f.d.wm.reset();f.d.wm.speed=30;Math.random=()=>0.99;
      idle.host=function(tok){const h=f.host.call(this,tok);return Object.assign(Object.create(h),{sleep:ms=>new Promise(r=>setTimeout(r,ms))})};
      f.startTrade=()=>{idle.active=true;const tok=++idle.token;f.trade=idle.doActivity('trading',tok).catch(e=>{if(e.constructor.name!=='Cancelled')f.tradeError=String(e)})};
      f.stopTrade=()=>{idle.stop();f.d.wm.reset()};f.startTrade();
    }`);
    await until(`window.__screenDetails.d.wm.root.querySelector('.tb-pair small')?.textContent==='Live price, Fixture public feed'`, 'Tradebot did not consume the supplied candle response');
    result.market = await js(`{const r=window.__screenDetails.d.wm.root;({note:r.querySelector('.tb-pair small').textContent,price:r.querySelector('.tb-px').textContent,canvas:r.querySelector('.tb-chart canvas').width,fictional:r.querySelector('.tb-fic').textContent})}`);
    check(result.market.price.includes('12,345.67') && result.market.canvas > 0 && result.market.fictional === 'Fictional coins', 'Tradebot uses supplied feed prices and identifies its fictional market section');
    check(result.marketRequests.some(r => r.method === 'klines' && r.symbol === 'BTCUSDT' && r.interval === '1m'), 'Tradebot requests Bitcoin candles for the actual timeframe');
    await shot('screen-details-trading-feed');
    await js(`window.__screenDetails.stopTrade()`);offline = true;
    await js(`window.__screenDetails.startTrade()`);
    await until(`window.__screenDetails.d.wm.root.querySelector('.tb-pair small')?.textContent==='Offline, simulated prices'`, 'Tradebot offline simulation was not clearly labelled');
    check(true, 'Unavailable market data is explicitly labelled Offline, simulated prices');
    await shot('screen-details-trading-offline');
    await js(`{const f=window.__screenDetails;f.stopTrade();Math.random=()=>0.01;f.startTrade()}`);
    await until(`window.__screenDetails.d.wm.root.querySelector('.tb-pair small')?.textContent==='Fictional coin, made-up prices'`, 'Parody coin was not explicitly labelled');
    check(await js(`window.__screenDetails.d.wm.root.querySelector('.tb-pair b').textContent==='BOLT/USD'`), 'Robot parody coin retains its made-up price label');
    await shot('screen-details-trading-parody');
  } catch (error) {
    result.error = String(error); await shot('screen-details-failure').catch(() => {}); throw error;
  } finally {
    await js(`{const f=window.__screenDetails;if(f){f.d.director.idleLife.stop();f.d.director.uac.reset();f.d.director.uac.deps=f.uacDeps;f.d.director.idleLife.host=f.host;f.d.wm.reset();f.d.wm.speed=f.speed;f.d.wm.prefs=f.prefs;Math.random=f.random;delete window.__screenDetails}}`).catch(() => {});
    ipcMain.removeHandler('market:klines'); ipcMain.removeHandler('market:price');market.register(ipcMain);save();
  }
  console.log(JSON.stringify({ screenDetails: result }));
};
