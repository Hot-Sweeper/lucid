// Opt-in coordinated Electron fixture. All reads and writes use local fixture dependencies.
const fs = require('node:fs'), path = require('node:path');
module.exports = async ({ js, wait, out }) => {
  const result = {};
  try {
    await js(`{
      const c=window.__chat;
      const f=window.__historyFixture={c,saved:{api:{...c.api},desk:c.desk,paired:c.paired},calls:[]};
      f.messages=Array.from({length:205},(_,i)=>({id:'history-'+i,role:'assistant',at:new Date(Date.UTC(2026,9,31,10,i)).toISOString(),sourceOrder:i+1,streaming:false,text:'History message '+i+'\\n\\n'+('Readable real chat-layout text. '.repeat(7)),attachments:[]}));
      c.api.t3=undefined;c.paired=false;c.api.sendMessage=async()=>{throw Error('History fixture never sends')};
      c.api.conversationPage=async(id,options={})=>{f.calls.push({id,before:options.before||null});const eligible=f.messages.filter(m=>!options.before||m.sourceOrder<options.before.rowid),messages=eligible.slice(-80);return{messages:structuredClone(messages),cursor:messages.length?{at:messages[0].at,rowid:messages[0].sourceOrder}:null,hasMore:eligible.length>80}};
      c.open({threadId:'fixture-history-pages',info:{title:'History fixture',provider:'codex'},profile:{name:'History fixture'}},false);c.setCollapsed(false);void 0;
    }`);
    await wait(120);
    await js(`(async()=>{const c=window.__historyFixture.c,until=Date.now()+5000;while(c.shown.size!==80&&Date.now()<until)await new Promise(r=>setTimeout(r,20))})()`);
    result.initial = await js(`{const f=window.__historyFixture,c=f.c;({shown:c.shown.size,more:!c.el.querySelector('.cp-history-more').hidden,first:[...c.shown.keys()][0]})}`);
    result.prepend = await js(`(async()=>{
      const f=window.__historyFixture,c=f.c,list=c.el.querySelector('.cp-list');list.scrollTop=list.scrollHeight*.4;
      const top=list.getBoundingClientRect().top,anchor=[...list.querySelectorAll('.cp-msg')].find(e=>e.getClientRects().length&&e.getBoundingClientRect().bottom>top),id=anchor.dataset.id,y=anchor.getBoundingClientRect().top;
      c.el.querySelector('.cp-history-more').click();while(c.loadingOlder)await new Promise(r=>setTimeout(r,10));
      return{shown:c.shown.size,anchor:id,error:Math.abs(c.shown.get(id).getBoundingClientRect().top-y),more:!c.el.querySelector('.cp-history-more').hidden};
    })()`);
    result.complete = await js(`(async()=>{
      const f=window.__historyFixture,c=f.c;await c.loadEarlier();
      const before=c.shown.get('history-0'),current=f.messages.at(-1),originalRender=c.render;let renders=0;c.render=function(m){renders++;return originalRender.call(this,m)};
      try {
        await c.refresh();const unchangedRenders=renders;
        current.text='Latest streaming replacement';current.streaming=true;await c.refresh();
        return{shown:c.shown.size,first:c.shown.has('history-0'),sameFirst:c.shown.get('history-0')===before,last:c.shown.get('history-204').textContent.includes('Latest streaming replacement'),more:!c.el.querySelector('.cp-history-more').hidden,calls:f.calls,unchangedRenders,changedRenders:renders-unchangedRenders,serializedMessages:[...c.shown.values()].filter(el=>el.dataset.sig!==undefined).length,currentReferences:[...c.renderedMessages].every(([id,m])=>c.history.rows.get(id)===m)};
      } finally {c.render=originalRender}
    })()`);
    result.streamingAnchor = await js(`(async()=>{
      const f=window.__historyFixture,c=f.c,list=c.el.querySelector('.cp-list');
      f.messages[203].at=f.messages[202].at;f.messages[204].text+='\\n\\n'+('Later content keeps this expanded earlier update within the scrollable range. '.repeat(50));await c.refresh();
      const anchor=c.shown.get('history-202'),group=anchor.closest('.cp-group'),details=group.querySelector('details');details.open=true;
      list.scrollTop+=anchor.getBoundingClientRect().top-list.getBoundingClientRect().top+10;
      const y=anchor.getBoundingClientRect().top,aligned=Math.abs(y-list.getBoundingClientRect().top+10)<=1;let metadataChanges=0;
      const collect=records=>{for(const r of records){const target=r.target.nodeType===1?r.target:r.target.parentElement;if(target?.closest('summary')||r.type==='attributes'&&target?.matches('.cp-earlier'))metadataChanges++}};
      const observer=new MutationObserver(collect);observer.observe(list,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden']});
      f.messages[126].text+='\\n\\n'+('Earlier content expanded during streaming. '.repeat(30));await c.refresh();
      collect(observer.takeRecords());observer.disconnect();
      return{sameAnchor:c.shown.get('history-202')===anchor,expanded:details.open,aligned,positionError:Math.abs(anchor.getBoundingClientRect().top-y),metadataChanges};
    })()`);
    result.passed = result.initial.shown === 80 && result.initial.more && result.initial.first === 'history-125'
      && result.prepend.shown === 160 && result.prepend.more && result.prepend.error <= 1
      && result.complete.shown === 205 && result.complete.first && result.complete.sameFirst && result.complete.last && !result.complete.more
      && result.complete.calls.filter(c=>c.before).length === 2
      && result.complete.unchangedRenders === 0 && result.complete.changedRenders === 1
      && result.complete.serializedMessages === 0 && result.complete.currentReferences
      && result.streamingAnchor.sameAnchor && result.streamingAnchor.expanded && result.streamingAnchor.aligned && result.streamingAnchor.positionError <= 1
      && result.streamingAnchor.metadataChanges === 0;
    fs.writeFileSync(path.join(out,'history-pagination-checks.json'),JSON.stringify(result,null,2));
    if (!result.passed) throw Error('Bounded history load, reader anchor, retained older content or newest-stream refresh failed');
  } finally {
    await js(`{const f=window.__historyFixture;if(f){Object.assign(f.c.api,f.saved.api);f.c.paired=f.saved.paired;f.c.close();if(f.saved.desk)f.c.open(f.saved.desk,false);delete window.__historyFixture}void 0}`);
  }
  return result;
};
