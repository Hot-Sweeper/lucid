const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
module.exports=async({js,wc,wait,out})=>{
  const results=[];
  await js(`{const c=window.__chat,d=window.__world.desks.get('perf-t0');c.open(d);window.chatTargetDesk=d;void 0;}`);
  await wait(400);
  for(const target of ['robot','robot-repeat','display','display-control','desk']) {
    const result=await js(`{
      const c=window.__chat,d=window.chatTargetDesk;c.setCollapsed(true,false);
      let target,controlRan=false;
      if(${JSON.stringify(target)}.startsWith('robot'))target=d.el.querySelector('.poke-head');
      else if(${JSON.stringify(target)}==='display')target=d.screen;
      else if(${JSON.stringify(target)}==='display-control'){
        target=document.createElement('button');target.textContent='Fixture screen control';d.monitor.append(target);
        target.addEventListener('click',e=>{e.stopPropagation();controlRan=true;});
      }else target=d.el;
      target.dispatchEvent(new MouseEvent('click',{bubbles:true,button:0}));
      if(${JSON.stringify(target)}==='display-control')target.remove();
      ({thread:c.threadId,expanded:!c.collapsed,controlRan,workerProfile:!!document.querySelector('.worker-profile')});
    }`);
    assert.equal(result.thread,'perf-t0',`${target} must open its robot's conversation`);
    assert.ok(result.expanded,`${target} must expand the side chat`);
    if(target==='display-control')assert.ok(result.controlRan,'Display controls must keep their original click');
    results.push({target,...result});
  }
  await wait(300);
  const errors=await js('window.__errs');assert.equal(errors.length,0);
  fs.writeFileSync(path.join(out,'desk-chat-results.json'),JSON.stringify({results,errors},null,2));
  fs.writeFileSync(path.join(out,'desk-chat.png'),(await wc.capturePage()).toPNG());
  console.log('Native desk chat checks passed:',results.map(x=>x.target).join(', '));
};
