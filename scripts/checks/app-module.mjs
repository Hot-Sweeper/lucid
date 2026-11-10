// Loads a renderer module from src/app for a check. Its imports are replaced by the fakes given
// (by name); the module's exported functions are returned, to be called with a fake app context.
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';

export async function loadAppModule(name, fakes = {}) {
  const text = await readFile(new URL(`../../src/app/${name}.ts`, import.meta.url), 'utf8');
  const code = (await transformWithOxc(text.replace(/^import\s[^;]+;\r?\n/gm, ''), `${name}.ts`)).code;
  const exported = [...code.matchAll(/^export (?:async )?function (\w+)/gm)].map((m) => m[1]);
  const keys = Object.keys(fakes);
  return new Function(...keys, `${code.replace(/^export /gm, '')}\nreturn { ${exported.join(', ')} };`)(...keys.map((k) => fakes[k]));
}

export async function appSource(name) {
  return readFile(new URL(`../../src/app/${name}.ts`, import.meta.url), 'utf8');
}
