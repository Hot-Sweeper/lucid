import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transformWithOxc } from "vite";
const code=(await transformWithOxc(await readFile(new URL("../src/office/desk-chat-targets.ts",import.meta.url),"utf8"),"targets.ts")).code.replace(/^export /gm,"").replace(/export\s*\{[^}]*\};?/g,"");
class Element {constructor(target){this.target=target;} closest(selector){assert.equal(selector,".poke-head, .robot-host, .monitor");return this.target;}}
const wire=new Function("Element",`${code};return wireDeskChatTargets`)(Element);
let callback,thread="one",dragged=false;const calls=[];
wire({addEventListener(kind,fn,capture){assert.equal(kind,"click");assert.equal(capture,true);callback=fn;}},()=>thread,()=>dragged,id=>calls.push(id));
for(const target of ["robot head","robot body","display","nested display button"]){
 const event={button:0,target:new Element(target),stopPropagation(){throw Error("Must preserve display controls");},preventDefault(){throw Error("Must preserve keyboard defaults");}};
 callback(event);
}
assert.deepEqual(calls,["one","one","one","one"]);
thread="two";callback({button:0,target:new Element("display")});assert.equal(calls.at(-1),"two","Reassigned desks open the current conversation");
const count=calls.length;
dragged=true;callback({button:0,target:new Element("display")});dragged=false;
thread=null;callback({button:0,target:new Element("display")});thread="two";
callback({button:1,target:new Element("display")});callback({button:2,target:new Element("display")});
callback({button:0,target:new Element(null)});callback({button:0,target:{}});
assert.equal(calls.length,count,"Dragging, empty desks, other mouse buttons and unrelated props stay unchanged");
console.log("Desk chat targets: capture-phase robot/display/nested controls, repeated clicks, reassignment, drag suppression and empty desks passed.");
