// Focused renderer fixture: actual app, Kit, localization and selected-row transitions.
import "@fontsource-variable/lexend";
import "@fontsource-variable/jetbrains-mono";
import "../src/styles.css";
import "../src/office/panels.css";
import "../src/life/life.css";
import {getLocale,setLocale,whenTranslationsIdle} from "../src/localization";
import {mountLanguageSetting} from "../src/office/language";
import {Kit} from "../src/life/util";
// The fixture build exposes this existing class without adding a production test API.
// @ts-expect-error Export added by the focused Vite transform.
import {BotsApp} from "../src/social/botsapp";
document.body.style.cssText="margin:0;padding:22px;background:#141a33;color:#eef0ff;font-family:'Lexend Variable',sans-serif";
document.querySelector('#fixture')!.innerHTML='<div id="language" style="width:740px;margin-bottom:16px"></div><h2 style="font-size:16px">BotsApp</h2><div id="app-body" style="position:relative;width:740px;height:396px;overflow:hidden"></div>';
mountLanguageSetting(document.querySelector<HTMLElement>('#language')!);
const body=document.querySelector<HTMLElement>('#app-body')!;
const host={stopped:false,sleep:async()=>{},pointAt:async()=>{},click:async()=>{},tap(){},react(){}};
const kit=new Kit(body,host,{maxMs:3600000});
const app=new BotsApp(kit,body,{maxMs:3600000,phone:false,me:'review_bot'});
const open=async(id:string)=>{await app.open(app.chats.find((c:{id:string})=>c.id===id));};
const state=()=>({locale:getLocale(),header:app.headName.textContent,row:app.cur.el.querySelector('b').textContent,id:app.cur.id,overflow:app.headName.scrollWidth>app.headName.clientWidth+1});
(window as any).nameReview={setLocale,whenTranslationsIdle,open,state,dispose(){app.dispose();kit.kill();}};
setLocale('en');await open('family');
