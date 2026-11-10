#!/usr/bin/env node
// After an installer is signed (which changes its bytes), refresh its sha512 and size in the
// update metadata so installed apps accept it:
//   node scripts/update-latest-yml.mjs release/latest.yml release/token-industries-1.2.3-win-x64.exe
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

const [yml, ...installers] = process.argv.slice(2);
if (!yml || !installers.length) { console.error("Usage: node scripts/update-latest-yml.mjs <latest.yml> <signed installer>..."); process.exit(1); }
let text = readFileSync(yml, "utf8");
for (const file of installers) {
  const data = readFileSync(file), name = basename(file);
  const sha512 = createHash("sha512").update(data).digest("base64");
  const entry = new RegExp(`(- url: ${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n\\s+sha512: )\\S+(\\n\\s+size: )\\d+`);
  if (!entry.test(text)) { console.error(`${name} is not listed in ${yml}.`); process.exit(1); }
  text = text.replace(entry, `$1${sha512}$2${data.length}`);
  // The top-level path/sha512 pair names the primary installer.
  if (new RegExp(`^path: ${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m").test(text)) text = text.replace(/^sha512: \S+$/m, `sha512: ${sha512}`);
  console.log(`${name}: sha512 and size updated.`);
}
writeFileSync(yml, text);
