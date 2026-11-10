import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';

const source = await readFile(new URL('../../src/os/highlight.ts', import.meta.url), 'utf8');
const code = (await transformWithOxc(source, 'highlight.ts')).code
  .replace(/export\s*\{[^}]*\};?/g, '').replace(/^export /gm, '')
  .replace(/new RegExp\(/g, 'new CountedRegExp(');
let constructions = 0;
function CountedRegExp(...args) { constructions++; return new RegExp(...args); }
const { highlight } = new Function('CountedRegExp', `${code};return {highlight}`)(CountedRegExp);
const cases = [
  ['c', 'const value = 42; // comment', '<span class="t-k">const</span> value = <span class="t-n">42</span>; <span class="t-c">// comment</span>'],
  ['hash', 'return True # comment', '<span class="t-k">return</span> <span class="t-k">True</span> <span class="t-c"># comment</span>'],
  ['markup', '<div><!-- comment', '<span class="t-k">&lt;div</span>&gt;<span class="t-c">&lt;!-- comment</span>'],
  ['css', '.class { color: "red"; }', '.<span class="t-k">class</span> { color: <span class="t-s">"red"</span>; }'],
  ['text', '# <title>', '<span class="t-h"># &lt;title&gt;</span>'],
  ['json', '{"key": 42}', '{<span class="t-s">"key"</span>: <span class="t-n">42</span>}'],
];
for (let repeat = 0; repeat < 1000; repeat++) for (const [lang, line, expected] of cases) {
  assert.equal(highlight(line, lang), expected, `${lang} output changed on repeat ${repeat}`);
  assert.equal(highlight('', lang), '', 'reusing a global tokenizer must reset its position');
}
assert.equal(constructions, 4, 'tokenizer allocation must stay bounded by syntax families, not line count');
console.log('PASS: syntax colors, escaped markup, empty lines and repeated language switches retain output with four tokenizer allocations');
