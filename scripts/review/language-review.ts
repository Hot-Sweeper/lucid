// Native acceptance fixture. Uses real game modules and the production preload/IPC.
import "@fontsource-variable/lexend";
import "@fontsource-variable/jetbrains-mono";
import "../../src/styles.css";
import "../../src/office/office.css";
import "../../src/office/panels.css";
import "../../src/world/world.css";
import "../../src/life/life.css";
import "../../src/fun/fun.css";
import { getLocale, setLocale, translateEntries, localizeData, whenTranslationsIdle } from "../../src/localization";
import { mountLanguageSetting } from "../../src/office/language";
import { localizeGameDOM } from "../../src/localization-dom";
import { watchTube } from "../../src/fun/tube";
import { hangOutInChat } from "../../src/life/chat";
import { chatOnBotsApp } from "../../src/social/botsapp";
import { Walker } from "../../src/world/walker";
import { WM } from "../../src/os/wm";
import { t3Icon, t3Title } from "../../src/harness/t3code";
import { JOKES, shuffled } from "../../src/world/jokes";
import { CONVOS } from "../../src/content/convos";
import { localizedFlavor } from "../../src/content/localized";
import { loadDaily, dailyConvo } from "../../src/office/daily";
import { drawMeme } from "../../src/life/memes";

document.body.style.cssText = "margin:0;padding:22px;background:#141a33;color:#eef0ff;font-family:'Lexend Variable',sans-serif";
const root = document.querySelector<HTMLElement>("#fixture")!;
root.innerHTML = `<div id="language" style="width:740px;margin-bottom:16px"></div><h2 id="heading" style="font-size:16px"></h2><div id="app-body" style="position:relative;width:740px;height:396px;overflow:hidden;background:#1d2252"></div><div id="speech" class="room" style="position:relative;width:740px;height:230px"></div><div id="exchange" style="width:740px;font-size:14px;line-height:1.7"></div>`;
mountLanguageSetting(document.querySelector<HTMLElement>("#language")!);
const body = document.querySelector<HTMLElement>("#app-body")!;
let advances=0;
function makeHost() {
  const held = new Set<(error:Error)=>void>();
  return { stopped:false,
    sleep(_ms:number) { return advances-->0?Promise.resolve():new Promise<void>((_resolve,reject)=>held.add(reject)); },
    stop() { this.stopped=true;for(const reject of held)reject(new Error('review stop'));held.clear(); },
    pointAt: async()=>{}, click:async()=>{}, tap(){}, react(){} };
}
let host=makeHost(), running: Promise<unknown> = Promise.resolve();
let actor: Walker | undefined, wm: WM | undefined, stop: (()=>void) | undefined;
const show = async (kind:string) => {
  host.stop(); await running.catch(error=>{if(error?.message!=='review stop')throw error;});host=makeHost();running=Promise.resolve();
  stop?.(); actor?.destroy(); wm?.destroy(); body.replaceChildren();
  actor=undefined;wm=undefined;stop=undefined;
  advances=kind==='BotsApp'?2:0;
  body.style.display=kind==='Speech'?'none':'block';
  body.style.width=kind==='Titles'?'820px':'740px';
  body.style.height=kind==='Titles'?'461px':'396px';
  document.querySelector("#heading")!.textContent = kind;
  document.querySelector("#exchange")!.textContent = "";
  if(kind === "BotTube") running=watchTube(body,host,{maxMs:3600000});
  if(kind === "Botcord") running=hangOutInChat(body,host,{maxMs:3600000,me:"review_bot"});
  if(kind === "BotsApp") running=chatOnBotsApp(body,host,{maxMs:3600000,me:"review_bot",phone:false});
  if(kind === "Speech") {
    actor = new Walker(document.querySelector("#speech")!,{id:"language-review",provider:"codex",flavorSpeech:true,name:"review_bot"});
    actor.setPos(370,190);actor.say("The clouds are buffering today.",120000);
    const exchange = document.querySelector<HTMLElement>("#exchange")!;
    exchange.textContent = (shuffled(JOKES)()).join("\n"); exchange.style.whiteSpace="pre-line";
    stop = localizeGameDOM(exchange,"Authored robot exchange");
  }
  if(kind === "Titles") {
    const screen=document.createElement('div');screen.style.cssText='width:820px;height:461px;position:relative';body.append(screen);
    const robot:any={setTyping(){},setMouse(){},pressKey(){},react(){},onKey(){},onMouse(){}};
    wm=new WM(screen,robot);wm.speed=100;
    wm.brandApp('t3code',{title:t3Title('stable'),icon:t3Icon('stable')});
    await wm.open('weather','Weather',true);
    await wm.open('calc','Calculator',true);
  }
  if(kind === "Canvas") {
    const c=document.createElement('canvas');c.width=640;c.height=350;body.append(c);
    const ctx=c.getContext('2d')!,original=ctx.fillText.bind(ctx);
    (window as any).canvasWords=[];
    ctx.fillText=((...args:Parameters<typeof ctx.fillText>)=>{(window as any).canvasWords.push(args[0]);return original(...args)}) as typeof ctx.fillText;
    drawMeme(c,'repo');
  }
  return true;
};
(window as any).review = {getLocale,setLocale,translateEntries,localizeData,whenTranslationsIdle,show,loadDaily,dailyConvo,
  authored:()=>localizedFlavor(CONVOS[0],"native authored exchange"),
  speech:()=>actor?.say("The clouds are buffering today.",120000),
  redrawCanvas:()=>{const c=body.querySelector('canvas');if(c)drawMeme(c,'repo');},
};
