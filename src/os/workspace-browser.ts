export type WorkspaceBrowserTarget = { id:string; appId:string; sessionId:string };
export type BrowserObservation = { workspace:WorkspaceBrowserTarget; url:string; title:string };
function resultOf(raw:any):any {
  if(raw?.structuredContent)return raw.structuredContent;
  if(raw?.status || raw?.apps || raw?.browser_navigate)return raw;
  try {return JSON.parse(typeof raw==='string'?raw:(raw?.content||[]).filter((c:any)=>c.type==='text').map((c:any)=>c.text).join('\n'));}catch{return {};}
}
const webUrl=(value:any):string=>{try{const u=new URL(value);return /^https?:$/.test(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}};
const isBrowser=(command:any)=>Array.isArray(command)&&(/(?:^|[/\\])agent-firefox$/.test(command[0]||'')||/(?:^|[/\\])(?:chromium|chrome|google-chrome)(?:-stable)?$/.test(command[0]||'')&&command.some((a:any)=>typeof a==='string'&&a.startsWith('--user-data-dir=')));
/** Observed workspace handles only. Shell URLs never identify a browser session. */
export class WorkspaceBrowserTracker {
  private targets=new Map<string,BrowserObservation>();
  reset(){this.targets.clear();}
  observe(name:string,input:any,raw:any,status:string):BrowserObservation|null {
    const base=name.replace(/^mcp__.+?__/,'').replace(/^[\w-]+\./,'');
    if(!/^workspace_/.test(base)||/failed|cancelled|interrupted|running|pending/.test(status))return null;
    const out=resultOf(raw);if(out.ok===false||raw?.isError)return null;
    const id=out.status?.id||out.target_handles?.workspace_id||input?.id;
    if(!id)return null;
    if(base==='workspace_stop'){this.targets.delete(id);return null;}
    const prior=this.targets.get(id);
    if(base==='workspace_kill_app'&&input?.app_id===prior?.workspace.appId){this.targets.delete(id);return null;}
    const app=out.apps?.find((a:any)=>a.running!==false&&isBrowser(a.command));
    const sessionId=out.status?.session_id||prior?.workspace.sessionId;
    const browser=out.browser_navigate||out.browser_snapshot||out.browser||out;
    const appId=app?.id||browser.app_id||prior?.workspace.appId;
    if(!sessionId||!appId||!app&&!prior&&!/^workspace_(open_browser|browser_)/.test(base))return null;
    if(!app&&!/^workspace_(browser_|click|key|paste|type|scroll|screenshot|observe|focus|wait)/.test(base))return null;
    const url=webUrl(browser.page?.url||input?.url)||app?.command.map(webUrl).find(Boolean)||prior?.url||'';
    const title=browser.page?.title||out.windows?.find((w:any)=>w.app_id===appId)?.title||prior?.title||'Agent browser';
    const observation={workspace:{id,appId,sessionId},url,title};this.targets.set(id,observation);return observation;
  }
}
