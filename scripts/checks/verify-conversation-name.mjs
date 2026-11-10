import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transformWithOxc} from 'vite';
const observers=[];
class Observer {constructor(fn){this.fn=fn;observers.push(this)}observe(label){this.label=label}disconnect(){this.disconnected=true}}
const source=(await transformWithOxc(await readFile('src/social/conversation-name.ts','utf8'),'conversation-name.ts')).code.replace(/export\s*\{[^}]*\};?/g,'').replace(/^export /gm,'');
const follow=new Function('MutationObserver',source+';return followConversationName;')(Observer);
const header={textContent:''},family={textContent:'Robot Family'},lunch={textContent:'Lunch Crew'};
const stopFamily=follow(header,family);assert.equal(header.textContent,'Robot Family');
family.textContent='Roboterfamilie';observers[0].fn();assert.equal(header.textContent,family.textContent);
stopFamily();const stopLunch=follow(header,lunch);assert.equal(header.textContent,'Lunch Crew');
family.textContent='An old async translation';observers[0].fn();assert.equal(header.textContent,'Lunch Crew','old conversation cannot overwrite the new header');
lunch.textContent='Mittagsrunde';observers[1].fn();assert.equal(header.textContent,lunch.textContent);
lunch.textContent='Lunch Crew';observers[1].fn();assert.equal(header.textContent,lunch.textContent);
stopLunch();lunch.textContent='After destruction';observers[1].fn();assert.equal(header.textContent,'Lunch Crew');
assert.ok(observers.every(o=>o.disconnected));
console.log('Conversation names passed: immediate binding, German update, switching conversation, stale callback, English restoration and cleanup.');
