// The open chat's robot is easy to find without covering it: "Show this robot" in the chat header
// glides to it, close up a warm floor light (drawn under the robot), the monitor bezel and the
// nameplate's accent ring mark it, far out a pin of constant screen size stands on its monitor,
// an edge pointer leads to it when it is out of view, and robots answer clicks and hovers with their chat.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
const load = async (path) => import('data:text/javascript;base64,' + Buffer.from((await transformWithOxc(await readFile(path, 'utf8'), path)).code).toString('base64'));
const { edgePoint, markScale, PIN_BELOW, pinScale } = await load('src/office/world/edge-point.ts');
const rig = await readFile('src/robot/rig.ts', 'utf8');
const geom = (name) => Object.fromEntries([...rig.match(new RegExp(`\\b${name}: \\{([^}]*)\\}`))[1].matchAll(/(\w+): ([\d.]+)/g)].map(([, k, v]) => [k, +v]));
const view = { left: 40, top: 80, right: 840, bottom: 680 };
assert.equal(edgePoint(400, 400, view), null, 'no pointer while the robot is in view');
assert.equal(edgePoint(860, 400, view, 30), null, 'a robot just past the edge counts as in view');
const right = edgePoint(5000, 380, view);
assert.equal(right.x, 840); assert.ok(right.y > 80 && right.y < 680 && Math.abs(right.angle) < .2, 'a robot far right is pointed at from the right edge');
const below = edgePoint(440, 9000, view);
assert.equal(below.y, 680); assert.ok(Math.abs(below.angle - Math.PI / 2) < .01, 'a robot below points down');
const corner = edgePoint(-3000, -3000, view);
assert.ok(corner.x >= 40 && corner.y >= 80 && (corner.x === 40 || corner.y === 80), 'clamped to the view border');
assert.equal(edgePoint(10, 10, { left: 50, top: 50, right: 40, bottom: 60 }), null, 'a collapsed view shows nothing');
assert.equal(markScale(1, 30, 22), 1, 'close up a sign keeps its own size');
assert.ok(Math.abs(markScale(.1, 30, 22) * 30 * .1 - 22) < 1e-9, 'far away it stays readable on screen');
// The far pin is drawn at 18 by 24 screen pixels and stays exactly that size at every far zoom.
for (const s of [PIN_BELOW - .01, .2, .14, .08, .03]) assert.ok(Math.abs(pinScale(s) * s - 1) < 1e-9, `the far pin keeps its screen size at zoom ${s}`);
assert.ok(PIN_BELOW > .2 && PIN_BELOW < .5, 'the pin only appears once the robot is too small to read its light');
// Its tip sits on the monitor, so its box (growing upward from the tip) never reaches the robot.
const monitor = geom('monitor'), head = geom('head'), tip = monitor.y + monitor.h * .45;
const robotTop = Math.min(head.y - 46, 197);   // the head's hit area and the robot's power box (desk.ts)
for (const s of [PIN_BELOW - .01, .14, .05]) assert.ok(tip < robotTop && tip - 24 / s < robotTop, `the pin stays above the robot at zoom ${s}`);
console.log('PASS: edge pointer placement, far pin size and place');

const panel = await readFile('src/office/chat-panel.ts', 'utf8');
assert.ok(/class="cp-locate cp-icon" aria-label="Show this robot"/.test(panel) && /icon\("locateRobot"\)/.test(panel), 'the header button shows the robot, with a clear icon and name');
assert.ok(!/cp-view|Look at the screen|setView\(/.test(panel), 'the old screen toggle is gone');
const chat = await readFile('src/app/chat.ts', 'utf8');
assert.ok(/onShowRobot = \(\) => \{ if \(app\.chat\.threadId\) app\.world\.showRobot\(app\.chat\.threadId\)/.test(chat));
const sidebar = await readFile('src/app/thread-sidebar.ts', 'utf8');
assert.ok(/app\.world\.setChatThread\(id\)/.test(sidebar), 'the marks follow the selected conversation');
const marks = await readFile('src/office/world/chat-mark.ts', 'utf8');
assert.ok(/insertBefore\(light, host\.querySelector\("\.robot-host"\)\)/.test(marks) && /host\.prepend\(light\)/.test(marks), 'the light is drawn under the seated or walking robot, never over it');
assert.ok(/this\.cam\.s < PIN_BELOW/.test(marks) && /GEOM\.monitor\.y \+ GEOM\.monitor\.h \* 0\.45/.test(marks), 'the pin shows only far out, its tip on the monitor');
assert.ok(!/chatTag|chat-mark"|icon\("chat"/.test(marks), 'no sticker over the robot any more');
assert.ok(/locateRobot\(/.test(marks) && /this\.neighbors/.test(marks) && /folded/.test(marks), 'the robot is found at its desk, folded office, walking or in a linked building');
const plates = await readFile('src/office/world/plates.ts', 'utf8');
assert.ok(/robot-chat/.test(marks) && /mountPlateCard\(\)/.test(marks) && /This chat is open/.test(plates) && /Click to open this chat/.test(plates), 'clicks and hovers answer with the chat');
const interact = await readFile('src/office/interact.ts', 'utf8');
assert.ok(/new CustomEvent\("robot-chat"/.test(interact), 'a click on a walking robot asks the office to open its chat');
const css = await readFile('src/office/chat-mark.css', 'utf8');
assert.ok(/prefers-reduced-motion/.test(css) && /\.chat-beacon:focus-visible/.test(css));
assert.ok(!/\.chat-mark\b/.test(css), 'the old chat tag styles are gone');
assert.ok(/\.desk-unit\.chat-open \.monitor/.test(css) && /\.chat-light \{[^}]*pointer-events: none/.test(css) && /\.chat-pin \{[^}]*pointer-events: none/.test(css), 'bezel light; light and pin never take clicks');
assert.ok(!/infinite/.test(css), 'no constant bouncing or looping');
const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion'));
assert.ok(/\.chat-pin\.on\.ping svg/.test(reduced) && /\.chat-light\.ping \.cl-bloom/.test(reduced), 'reduced motion drops the arrival movement');
assert.ok(/\.desk-unit\.chat-open \.desk-plate/.test(await readFile('src/office/plates.css', 'utf8')), 'the open chat\'s nameplate carries the accent ring');
const camera = await readFile('src/office/world/camera-view.ts', 'utf8');
assert.ok(/if \(this\.chatThread\) this\.paintChatMark\(\)/.test(camera), 'marks follow the camera');
console.log('PASS: Show this robot, floor light, bezel, nameplate ring, far pin, edge pointer and robot click and hover');
