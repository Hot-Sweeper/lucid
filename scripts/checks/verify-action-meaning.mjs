// Styling carries meaning: destructive actions look destructive everywhere, error notices are not
// styled as destructive confirmations, and the status vocabulary never renders as a capsule.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const read = (p) => readFile(p, 'utf8');
const menus = await read('src/app/menus.ts');
for (const label of ['"Remove this desk"', '"Remove empty desks in this office"', '`Remove ${free} empty desk', '"Remove project from T3"']) {
  const line = menus.split('\n').find(l => l.includes(`label: ${label}`));
  assert.ok(line && /danger: true/.test(line), `${label} is marked destructive`);
}
assert.ok(/label: "Archive in T3", danger: true/.test(await read('src/app/thread-actions.ts')), 'Archive is marked destructive');
// Notices use one plain OK; only real destructive confirmations get the danger button.
const files = (await readdir('src', { recursive: true })).filter(f => f.endsWith('.ts')).map(f => `src/${f}`);
for (const f of files) assert.ok(!/confirmDialog\([^;]*"OK"\)/.test(await read(f)), `${f}: an error notice uses noticeDialog, not a destructive confirm`);
const dialogs = await read('src/office/menus.ts');
assert.ok(/export function noticeDialog/.test(dialogs) && /destructive \? '<button type="button" class="ghost" data-a="no">Cancel<\/button><button type="button" class="primary danger"/.test(dialogs));
const controls = await read('src/ui/controls.css');
assert.ok(/button:where\(\.primary\.danger\) \{ background: var\(--danger\); color: var\(--on-danger\); \}/.test(controls), 'danger fills carry their own ink');
assert.ok(/button:where\(\.primary\.danger\):hover:not\(:disabled\)/.test(controls), 'a danger button keeps a danger hover (not the accent hover)');
assert.ok(/button:where\(\.pop-menu > \.danger\) \{ color: var\(--danger-ink\)/.test(controls) && /button:where\(\.pop-menu > \.danger\):is\(:hover, :focus-visible\)/.test(controls), 'destructive menu items read and hover as destructive');
assert.ok(/button:where\(\.ghost\.danger\)/.test(controls));
const office = await read('src/office/office.css');
assert.ok(/\.cq-yes \{ background: var\(--danger\)/.test(office) && /\.empty-desk-remove \{[^}]*color:var\(--danger-ink\)/.test(office), 'queue removal and empty-desk removal use the danger token');
assert.ok(/primary danger wf-retire-yes/.test(await read('src/office/worker-focus.ts')), 'retiring a worker is confirmed with the danger button');
console.log('PASS: destructive actions, notices and confirmations are styled by meaning');

const status = await read('src/ui/status.css');
assert.ok(/\.ui-status \{[^}]*background: none;[^}]*\}/.test(status) && /\.ui-status \{[^}]*padding: 0;/.test(status), 'status renders as icon and word, never a capsule');
for (const f of ['src/office/monitor-tasks.css', 'src/office/monitor-report.css']) assert.ok(!/\.mt-chip[^{]*\{[^}]*background:(?!\s*none)[^;]+;/.test(await read(f)), `${f}: no fill behind the monitor status`);
assert.ok(/e\.detail > 1/.test(await read('src/office/world/desks.ts')), 'double clicking a monitor does not select (and grey out) a word');
console.log('PASS: the status vocabulary renders the same clean way on monitors');
