// One project identity everywhere, as the thread sidebar shows it: a project's own icon, otherwise a
// two-letter monogram; "No project" (no project or T3's scratch one) is always the dashed square and
// never a monogram. Every place that shows a project draws it with src/ui/project-icon.ts.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { transformWithOxc } from 'vite';

const path = 'src/ui/project-icon.ts';
const source = (await readFile(path, 'utf8'))
  .replace(/^import "\.\/project-icon\.css";\n/m, '')
  .replace(/^import \{ esc \} from "\.\.\/util\/html";/m, (await readFile('src/util/html.ts', 'utf8')).match(/export const esc = .*;/)[0].replace('export ', ''));
const mod = await import('data:text/javascript;base64,' + Buffer.from((await transformWithOxc(source, path)).code).toString('base64'));
const { projectMark, projectMarkOf, projectName, projectIcon, projectChip, projectIconSvg, projectMonogram, NO_PROJECT } = mod;

assert.equal(NO_PROJECT, 'No project');
assert.equal(projectMark(null), null);
assert.equal(projectMark({ title: 'No project', icon: null, scratch: true }), null, "T3's scratch project is No project");
assert.equal(projectMarkOf([{ id: 'a', title: 'Lucid', icon: null, scratch: false }], 'gone'), null, 'a missing project is No project');
assert.deepEqual(projectMarkOf([{ id: 'a', title: 'Lucid', icon: 'x.png', scratch: false }], 'a'), { title: 'Lucid', icon: 'x.png' });
assert.equal(projectName(null), 'No project');

// No project: the dashed square in HTML and SVG, never a monogram, whatever it is called.
for (const html of [projectIcon(null), projectIcon(null, 18), projectChip(null)]) {
  assert.ok(/proj-none/.test(html), 'No project draws the dashed square');
  assert.ok(!/proj-mono|proj-img|>NP<|>NO<|>N<\/span>/.test(html), 'No project never draws a monogram or image');
}
assert.ok(/>No project</.test(projectChip(null)), 'the chip names it No project');
const noneSvg = projectIconSvg(null, 0, 0, 46);
assert.ok(/stroke-dasharray/.test(noneSvg) && !/<text|<image/.test(noneSvg), 'room signs draw No project as the dashed square too');

// Projects: their icon, else a consistent monogram.
assert.ok(/<img class="proj-icon proj-img"[^>]*src="lucid-file:\/\/x"/.test(projectIcon({ title: 'MotionLab', icon: 'lucid-file://x' })), 'a project with an icon shows it');
assert.equal(projectMonogram('FL Studio on Linux'), 'FS');
assert.equal(projectMonogram('MotionLab'), 'ML', 'camelCase counts as two words');
assert.equal(projectMonogram('lucid'), 'LU');
const mono = projectIcon({ title: 'FL Studio on Linux' }, 18);
assert.ok(/proj-mono/.test(mono) && />FS</.test(mono) && /--pi:18px/.test(mono) && /--pi-hue:\d+/.test(mono), 'others show the monogram tile');
assert.equal(projectIcon({ title: 'FL Studio on Linux' }), projectIcon({ title: 'FL Studio on Linux' }), 'the same project always looks the same');
assert.ok(/<text[^>]*>FS<\/text>/.test(projectIconSvg({ title: 'FL Studio on Linux' }, 0, 0, 46)), 'room signs use the same monogram');
assert.ok(!/<script|" onerror/.test(projectChip({ title: '<script>', icon: '" onerror="x' })), 'names and icons are escaped');
console.log('PASS: project marks (icon, monogram, dashed square for No project)');

// Every place that shows a project uses the shared helper, and no ad-hoc monogram is left.
const users = {
  'src/app/thread-sidebar.ts': 'sidebar rows and rail',
  'src/office/desk.ts': 'the sign over a monitor',
  'src/office/world/room-art.ts': 'room signs (also in linked buildings)',
  'src/app/rooms.ts': 'Office & settings rooms',
  'src/office/world/plates.ts': 'the hover card',
  'src/office/chat-panel.ts': 'the chat header and thread references',
  'src/office/thread-drag.ts': 'a dragged thread',
  'src/app/thread-actions.ts': 'Move to menus',
  'src/office/hire.ts': 'the hire composer project field',
  'src/stats/ledger-panel.ts': 'the coin ledger',
  'src/stats/stats.ts': 'usage by project',
  'src/office/report.ts': 'report papers',
  'src/office/delegate.ts': 'the decision log',
};
for (const [file, place] of Object.entries(users)) assert.ok(/from "(\.\.\/)+ui\/project-icon"/.test(await readFile(file, 'utf8')), `${place} use the shared project icon`);

const files = async (dir) => (await readdir(dir, { withFileTypes: true, recursive: true })).filter((e) => e.isFile() && /\.(ts|css)$/.test(e.name)).map((e) => join(e.parentPath ?? e.path, e.name));
// The robots' in-world T3 app (src/harness/t3code.ts) draws T3's own badges in its parody style.
for (const file of [...await files('src/app'), ...await files('src/office'), ...await files('src/stats'), ...await files('src/ui')]) {
  if (file.endsWith('project-icon.ts')) continue;
  const text = await readFile(file, 'utf8');
  assert.ok(!/th-mono|dp-mono|rail-mono|th-none|function monogram\(/.test(text), `${file} has no project monogram of its own`);
  assert.ok(!/(proj|project|title)[\w.]*\.slice\(0, 2\)\.toUpperCase\(\)/.test(text), `${file} builds no monogram from a project name`);
  assert.ok(!/title: "No project", icon: null/.test(text), `${file} does not fake No project as a project`);
}
console.log('PASS: every project place uses the shared project icon');
