// The World class's source text: src/office/world.ts plus the files in src/office/world/ that
// hold its methods (they are mixed into one class). Checks slice production code out of it.
import { readFile, readdir } from 'node:fs/promises';

const root = new URL('../../src/office/', import.meta.url);
export async function worldSource() {
  const parts = [await readFile(new URL('world.ts', root), 'utf8')];
  for (const name of (await readdir(new URL('world/', root))).sort()) if (name.endsWith('.ts')) parts.push(await readFile(new URL(`world/${name}`, root), 'utf8'));
  return parts.join('\n');
}
