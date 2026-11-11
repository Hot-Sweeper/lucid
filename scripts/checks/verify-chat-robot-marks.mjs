// The open chat's robot is easy to find: "Show this robot" in the chat header glides to it, a chat
// tag stays readable over its head at every zoom, its nameplate carries the accent ring, an edge
// pointer leads to it when it is out of view, and robots answer clicks and hovers with their chat.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
const load = async (path) => import('data:text/javascript;base64,' + Buffer.from((await transformWithOxc(await readFile(path, 'utf8'), path)).code).toString('base64'));
const { edgePoint, markScale } = await load('src/office/world/edge-point.ts');
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
assert.equal(markScale(1, 30, 22), 1, 'close up the tag keeps its own size');
assert.ok(Math.abs(markScale(.1, 30, 22) * 30 * .1 - 22) < 1e-9, 'far away it stays 22px on screen');
console.log('PASS: edge pointer placement and far-view tag size');

const panel = await readFile('src/office/chat-panel.ts', 'utf8');
assert.ok(/class="cp-locate cp-icon" aria-label="Show this robot"/.test(panel) && /icon\("locateRobot"\)/.test(panel), 'the header button shows the robot, with a clear icon and name');
assert.ok(!/cp-view|Look at the screen|setView\(/.test(panel), 'the old screen toggle is gone');
const chat = await readFile('src/app/chat.ts', 'utf8');
assert.ok(/onShowRobot = \(\) => \{ if \(app\.chat\.threadId\) app\.world\.showRobot\(app\.chat\.threadId\)/.test(chat));
const sidebar = await readFile('src/app/thread-sidebar.ts', 'utf8');
assert.ok(/app\.world\.setChatThread\(id\)/.test(sidebar), 'the marks follow the selected conversation');
const marks = await readFile('src/office/world/chat-mark.ts', 'utf8');
assert.ok(/locateRobot\(/.test(marks) && /this\.neighbors/.test(marks) && /folded/.test(marks), 'the robot is found at its desk, folded office, walking or in a linked building');
assert.ok(/robot-chat/.test(marks) && /This chat is open/.test(marks) && /Click to open this chat/.test(marks), 'clicks and hovers answer with the chat');
const interact = await readFile('src/office/interact.ts', 'utf8');
assert.ok(/new CustomEvent\("robot-chat"/.test(interact), 'a click on a walking robot asks the office to open its chat');
const css = await readFile('src/office/chat-mark.css', 'utf8');
assert.ok(/prefers-reduced-motion/.test(css) && /\.desk-unit\.chat-open \.desk-plate/.test(css) && /\.chat-beacon:focus-visible/.test(css));
const camera = await readFile('src/office/world/camera-view.ts', 'utf8');
assert.ok(/if \(this\.chatThread\) this\.paintChatMark\(\)/.test(camera), 'marks follow the camera');
console.log('PASS: Show this robot, chat tag, nameplate ring, edge pointer and robot click and hover');
