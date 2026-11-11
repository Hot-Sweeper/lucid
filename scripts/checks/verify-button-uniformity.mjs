// Every accent-filled button takes the same face from src/ui/controls.css: accent ink on text and
// icon in every theme, one height scale, and no feature rule that recolours or resizes it.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const root = new URL('../../src/', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const controls = await read('ui/controls.css');
const styles = await read('styles.css');

// The global `button { color: inherit }` (styles.css) outranks a bare :where(); the shared faces
// carry the element so their ink wins. This is what painted the +Task label white in Night blue.
assert(/^button, textarea, input \{ font: inherit; color: inherit; \}/m.test(styles), 'fixture: the global button colour reset still exists');
assert(/button:where\(\.primary\), a:where\(\.primary\) \{ background: var\(--accent\); color: var\(--accent-ink\); \}/.test(controls), 'primary ink beats the global reset');
assert(/button:where\(\.ghost\), a:where\(\.ghost\) \{[^}]*color: var\(--ink\)/.test(controls), 'ghost ink beats the global reset');
assert(/:where\(\.primary, \.ghost\) > \.ui-icon \{ color: currentColor; \}/.test(controls), 'icons take the label colour');
assert(/min-height: var\(--control-h\);/.test(controls) && /:where\(\.compact\) \{ min-height: var\(--control-h-sm\);/.test(controls), 'two sizes on the shared scale');
assert(/--control-h: 32px;/.test(styles) && /--control-h-sm: 26px;/.test(styles));

const shell = await read('app/shell.ts');
for (const [cls, what] of [['primary compact update', 'Update'], ['primary compact th-new-task', '+Task'], ['ghost compact th-new-project', '+Project']])
  assert(shell.includes(`class="${cls}"`), `${what} is a shared compact button`);

// No feature stylesheet paints its own accent button (they reuse .primary instead). Exceptions are
// surfaces drawn in the world or on paper: robot monitors, the desk plan, the settlement paper.
const css = [];
const walk = async (dir) => { for (const e of await readdir(new URL(dir, root), { withFileTypes: true })) {
  const path = `${dir}${e.name}`;
  if (e.isDirectory()) { if (!['os/', 'fun/', 'social/', 'harness/', 'leisure/'].some(d => `${path}/`.endsWith(d))) await walk(`${path}/`); }
  else if (e.name.endsWith('.css') && path !== 'ui/controls.css') css.push([path, await read(path)]);
} };
await walk('');
for (const [path, text] of css) for (const rule of text.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
  const [, selector, body] = rule;
  if (/\.(update|cp-send|cq-save|cq-yes|lim-cyes|dc-x|th-new-task|th-new-project|primary|ghost)(?![\w-])/.test(selector) && !/monitor|desk-plan|chair-approve|cp-review|settlement-paper/.test(selector))
    assert(!/(^|;)\s*(background|color|font-size|border-radius)\s*:/.test(body), `${path}: "${selector.trim()}" must not restyle a shared button`);
}
console.log('PASS: accent buttons share one face (accent ink, two sizes) and no feature rule restyles them');
