// Isolated chat fixture. No messages are submitted and no real tasks are started.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
module.exports = async ({ js, wc, wait, out, dbg }) => {
  const result = { cycles: [] };
  const baseline = process.env.LUCID_SHELF_BASELINE === '1';
  const until = async expression => {
    for (let i=0;i<60;i++) { if (await js(expression)) return; await wait(50); }
    throw Error(`Shelf did not settle: ${expression}`);
  };
  try {
    await js(`{
      const w=window.__world,c=window.__chat;
      window.shelfKeepAlive=setInterval(()=>window.dispatchEvent(new Event('pointermove')),100);
      c.open(w.desks.get('perf-t0'));window.shelfQA={};
    }`);
    await wait(900);
    await js(`{
      const c=window.__chat,list=c.el.querySelector('.cp-list'),ta=c.el.querySelector('textarea');
      ta.value='Draft retained during shelf motion';ta.dispatchEvent(new Event('input'));
      list.scrollTop=Math.min(400,list.scrollHeight-list.clientHeight);
      shelfQA.scroll=list.scrollTop;shelfQA.row=list.firstElementChild;
      shelfQA.measure=(on)=>new Promise(resolve=>{
        const c=window.__chat,samples=[],start=performance.now();let last=start;
        c.setCollapsed(on);
        const frame=now=>{
          samples.push({at:now-start,gap:now-last,width:window.__world.scene.clientWidth});last=now;
          if(now-start<650)requestAnimationFrame(frame);else resolve(samples);
        };requestAnimationFrame(frame);
      });void 0;
    }`);
    for (let i=0;i<4;i++) {
      const closing=i%2===0;
      const samples=await js(`shelfQA.measure(${closing})`);
      const gaps=samples.map(x=>x.gap).sort((a,b)=>a-b);
      const cycle={ closing, widthChanges:new Set(samples.map(x=>x.width)).size,
        frames:samples.length, p95FrameGapMs:gaps[Math.floor(gaps.length*.95)], maxFrameGapMs:gaps.at(-1) };
      result.cycles.push(cycle);
      if (!baseline) assert.ok(cycle.widthChanges<=2,'A toggle must not resize the whole office on every animation frame');
    }
    result.retained=await js(`{
      const c=window.__chat,list=c.el.querySelector('.cp-list');
      ({draft:c.el.querySelector('textarea').value,scroll:list.scrollTop,expected:shelfQA.scroll,
        sameRow:list.firstElementChild===shelfQA.row,expanded:!c.collapsed});
    }`);
    assert.equal(result.retained.draft,'Draft retained during shelf motion');
    assert.ok(result.retained.sameRow,'Toggling must retain transcript DOM');
    assert.ok(Math.abs(result.retained.scroll-result.retained.expected)<2,'Toggling must retain reading position');
    if (!baseline) {
      await js(`window.__chat.setCollapsed(true)`);await wait(55);
      await js(`window.__chat.setCollapsed(false)`);await wait(55);
      await js(`window.__chat.setCollapsed(true)`);await wait(300);
      await until(`window.__chat.el.classList.contains('tabbed')`);
      result.reversed=await js(`({collapsed:window.__chat.collapsed,hidden:window.__chat.el.classList.contains('tabbed'),inert:window.__chat.el.inert,width:window.__chat.el.style.width,motions:window.__chat.el.getAnimations().length})`);
      assert.ok(result.reversed.collapsed&&result.reversed.hidden&&result.reversed.inert);
      assert.equal(result.reversed.width,'');assert.equal(result.reversed.motions,0);
      await js(`window.__chat.setCollapsed(false)`);await wait(60);
      await js(`document.querySelector('.grip.right').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}))`);
      await wait(300);
      result.resize=await js(`({width:window.__chat.el.style.width,position:window.__chat.el.style.position,inert:window.__chat.el.inert})`);
      assert.equal(result.resize.width,'');assert.equal(result.resize.position,'');assert.equal(result.resize.inert,false);
      await dbg.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
      await js(`window.__chat.setCollapsed(true)`);
      assert.ok(await js(`window.__chat.el.classList.contains('tabbed') && window.__chat.el.getAnimations().length===0`));
      await js(`window.__chat.setCollapsed(false)`);
      assert.ok(await js(`!window.__chat.el.inert && window.__chat.el.getAnimations().length===0`));
      await dbg.sendCommand('Emulation.setEmulatedMedia',{features:[]});
    }
    result.errors=await js(`window.__errs`);assert.equal(result.errors.length,0);
    fs.writeFileSync(path.join(out,'shelf-open.png'),(await wc.capturePage()).toPNG());
    result.passed=true;
    console.log('Chat shelf checks',JSON.stringify(result));
  } finally {
    await js(`clearInterval(window.shelfKeepAlive)`).catch(()=>{});
    fs.writeFileSync(path.join(out,'shelf-results.json'),JSON.stringify(result,null,2));
  }
};
