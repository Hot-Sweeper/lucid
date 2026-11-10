// Checks the Explorer's pure parts: what it knows about folders, where an attached file came from, file types,
// and the read-only file facts the app's fs:stat uses. No window, no network, no upload.
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { transformWithOxc } from "vite";

// These modules have no imports of their own, so each one is compiled and loaded as it is.
const load = async (file) => {
  const { code } = await transformWithOxc(await readFile(new URL(`../../src/os/${file}`, import.meta.url), "utf8"), file);
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
};
const model = await load("explorer-model.ts");
const kinds = await load("file-kinds.ts");
const source = await load("attachment-source.ts");

const require = createRequire(import.meta.url);
const { fileFacts } = require("../../electron/file-facts.cjs");

// ---- paths -------------------------------------------------------------------------------------------
assert.equal(model.normPath("c:\\Users\\tim\\"), "C:/Users/tim");
assert.equal(model.normPath("C:\\"), "C:/");
assert.equal(model.parentOf("C:/Users"), "C:/");
assert.equal(model.parentOf("C:/"), null);
assert.equal(model.parentOf("/home"), "/");
assert.equal(model.nameOf("C:/"), "C:");
assert.equal(model.pathKey("C:/Users/Tim"), model.pathKey("c:\\users\\tim"), "Windows paths ignore case");
assert.notEqual(model.pathKey("/Home/Tim"), model.pathKey("/home/tim"), "other paths keep case");
assert.ok(model.isInside("C:/proj/src", "c:/PROJ"));
assert.ok(!model.isInside("C:/proj2", "C:/proj"), "a sibling with the same prefix is not inside");
assert.deepEqual(model.ancestry("C:/a/b"), ["C:/", "C:/a", "C:/a/b"]);
assert.equal(model.joinPath("C:/proj", "./src\\os"), "C:/proj/src/os");

// ---- address bar -------------------------------------------------------------------------------------
const crumbs = model.crumbsFor("C:/work/Lucid/src/os", "C:/work/Lucid");
assert.deepEqual(crumbs.map((c) => c.label), ["Lucid", "src", "os"], "inside the project the bar starts at the project");
assert.deepEqual(model.crumbsFor("D:/other/place", "C:/work/Lucid").map((c) => c.label), ["D:", "other", "place"], "outside it starts at the disk");
const deep = model.crumbsFor("C:/r/a/b/c/d/e/f/g", "C:/r");
const folded = model.collapseCrumbs(deep, 4);
assert.equal(folded.shown[0].label, "r");
assert.equal(folded.shown.at(-1).label, "g");
assert.equal(folded.shown.length + folded.hidden.length, deep.length, "folding hides segments but loses none");
assert.equal(model.collapseCrumbs(crumbs, 4).hidden.length, 0, "a short path is not folded");

// ---- the walk ----------------------------------------------------------------------------------------
const steps = (a, b) => model.route(a, b).map((s) => `${s.via}:${s.path}`);
assert.deepEqual(steps("C:/p", "C:/p/src/os"), ["down:C:/p/src", "down:C:/p/src/os"]);
assert.deepEqual(steps("C:/p/src/os", "C:/p/docs"), ["up:C:/p", "down:C:/p/docs"], "one jump up to the shared folder, then down");
assert.deepEqual(steps("C:/p/src/os", "C:/p/src"), ["up:C:/p/src"]);
assert.deepEqual(steps("C:/p", "c:\\P"), [], "already there");

// ---- what is known ------------------------------------------------------------------------------------
const m = new model.FolderModel();
m.see("C:/p/src/os/apps.ts", false);
assert.deepEqual(m.children("C:/p/src").map((c) => c.name), ["os"], "a touched path shows its folders and nothing else");
assert.ok(!m.isListed("C:/p/src"), "a folder that was never listed is not marked as listed");
m.list("C:/p/src/os", [{ name: "wm.ts", dir: false }, { name: "icons", dir: true }]);
assert.deepEqual(m.children("C:/p/src/os").map((c) => c.name), ["icons", "wm.ts"], "folders first, then files");
assert.ok(m.isListed("C:/p/src/os"));
m.problem("C:/p/locked", "denied");
assert.equal(m.problemOf("c:/P/locked"), "denied");
assert.equal(model.listingProblem("Get-ChildItem : Cannot find path 'x' because it does not exist."), "missing");
assert.equal(model.listingProblem("ls: cannot access 'nope': No such file or directory"), "missing");
assert.equal(model.listingProblem("Get-ChildItem : Access to the path 'x' is denied."), "denied");
assert.equal(model.listingProblem("ls: cannot open directory 'x': Permission denied"), "denied");
assert.equal(model.listingProblem(""), null, "an empty result is just an empty folder");
assert.equal(model.fmtDate(Date.UTC(2026, 10, 2, 12, 5) + new Date().getTimezoneOffset() * 0), model.fmtDate(Date.UTC(2026, 10, 2, 12, 5)));
assert.match(model.fmtDate(new Date(2026, 10, 2, 22, 47).getTime()), /^2026-11-02 22:47$/);
assert.equal(model.fmtBytes(1536), "1.5 KB");

// ---- file types ---------------------------------------------------------------------------------------
assert.equal(kinds.kindOf("a.PNG"), "image");
assert.equal(kinds.kindOf("src", true), "folder");
assert.equal(kinds.kindOf("Makefile"), "generic");
assert.equal(kinds.kindOf(".gitignore"), "generic", "a dotfile has no extension");
assert.equal(kinds.typeLabel("explorer.ts"), "TypeScript file");
assert.equal(kinds.typeLabel("shot.png"), "PNG image");
assert.equal(kinds.typeLabel("report.csv"), "CSV spreadsheet");
assert.equal(kinds.typeLabel("a.zip"), "ZIP archive");
assert.equal(kinds.typeLabel("noext"), "File");
for (const k of ["folder", "image", "code", "web", "style", "data", "doc", "pdf", "sheet", "slides", "archive", "audio", "video", "app", "generic"]) {
  const svg = kinds.iconFor(k);
  assert.ok(svg.startsWith("<svg") && !/stroke/i.test(svg), `${k} icon is a filled shape`);
}

// ---- where an attached file came from -----------------------------------------------------------------
const att = (id, name, type = "file") => ({ id, name, type, mimeType: "application/octet-stream", sizeBytes: 10 });
const prep = (id, att, url) => ({ id: `p-${id}`, type: "dynamic_tool", status: "completed", data: { toolName: "mcp__t3-code__t3_attachment_prepare_upload", input: { upload: {} }, output: { attachmentId: att, relativeUrl: url } } });
const shell = (id, command, status = "completed", tool = "Bash") => ({ id, type: "dynamic_tool", status, data: { toolName: tool, input: { command } } });
const a1 = att("pending-1", "after screen.png", "image");
const url1 = "/mcp/uploads/pending-1";
let s = source.sourcesFor([a1], [prep(1, a1.id, url1), shell("c1", `curl -s -X POST --data-binary @"C:\\work\\Lucid\\out\\after screen.png" http://127.0.0.1:3777${url1}`)]);
assert.equal(s[0].path, "C:\\work\\Lucid\\out\\after screen.png", "a quoted path with a space");
assert.equal(s[0].how, "upload-command");
assert.equal(s[0].upload, "sent");
s = source.sourcesFor([a1], [prep(1, a1.id, url1), shell("c1", `Invoke-RestMethod -Method Post -InFile 'C:\\work\\o\\after screen.png' -Uri http://127.0.0.1:3777${url1}`, "completed", "PowerShell")]);
assert.equal(s[0].path, "C:\\work\\o\\after screen.png");
s = source.sourcesFor([a1], [prep(1, a1.id, url1), shell("c1", `curl --data-binary @/tmp/a/after screen.png http://h${url1}`)]);
assert.equal(s[0].path, null, "an unquoted path with a space cannot be read reliably, so no folder is claimed");
s = source.sourcesFor([a1], [prep(1, a1.id, url1), shell("c1", "ls -la")]);
assert.equal(s[0].path, null, "a command that does not carry the upload says nothing about the file");
assert.equal(s[0].how, "unknown");
s = source.sourcesFor([a1], [shell("c1", `curl --data-binary @"C:\\x\\after screen.png" http://h/anything`)]);
assert.equal(s[0].path, null, "without the upload slot the command is not tied to this attachment");
s = source.sourcesFor([a1], [prep(1, a1.id, url1), shell("c1", `curl --data-binary @"C:\\x\\after screen.png" http://h${url1}`, "failed")]);
assert.equal(s[0].upload, "failed", "a failed upload is reported as failed");
const b1 = att("pending-2", "b.png", "image"), b2 = att("pending-3", "c.csv");
s = source.sourcesFor([b1, b2], [prep(2, b1.id, "/u/2"), prep(3, b2.id, "/u/3"), shell("c", `for f in "C:\\o\\b.png" "C:\\o\\c.csv"; do :; done # /u/2 /u/3`)]);
assert.deepEqual(s.map((x) => x.path), ["C:\\o\\b.png", "C:\\o\\c.csv"], "one command carrying two files: each file is matched by name");
const d1 = att("pending-4", "renamed.png", "image");
s = source.sourcesFor([d1], [prep(4, d1.id, "/u/4"), shell("c", `curl --data-binary @"C:\\o\\shot-1.png" http://h/u/4`)]);
assert.equal(s[0].path, "C:\\o\\shot-1.png", "one candidate of the same type is accepted when the sent name differs");
s = source.sourcesFor([d1], [prep(4, d1.id, "/u/4"), shell("c", `curl --data-binary @"C:\\o\\shot-1.png" -F "x=@C:\\o\\shot-2.png" http://h/u/4`)]);
assert.equal(s[0].path, null, "two candidates and no name match: no guess");
s = source.sourcesFor([a1], [prep(1, a1.id, url1), shell("c1", `curl --data-binary @"./out/after screen.png" http://h${url1}`)], "C:/work/Lucid");
assert.equal(s[0].path, "C:/work/Lucid/out/after screen.png", "a relative path is anchored on the working folder");
s = source.sourcesFor([a1], [prep(1, a1.id, url1), shell("c1", `curl --data-binary @"./out/after screen.png" http://h${url1}`)]);
assert.equal(s[0].path, null, "without a working folder a relative path is not trusted");
s = source.sourcesFor([a1], [prep(1, a1.id, url1), shell("c1", `curl --data-binary @"C:\\work\\after screen.png" "http://127.0.0.1:3777${url1}/after screen.png"`)]);
assert.equal(s[0].path, "C:\\work\\after screen.png", "the address of the upload slot is never taken for a file");
assert.deepEqual(source.attachmentsOf({ attachments: [{ id: "a", name: "x.png" }, { name: "no id" }, null, ...Array.from({ length: 12 }, (_, i) => ({ id: `i${i}`, name: `f${i}` }))] }).length, 8, "at most eight files, and only entries that name an id and a file");
assert.deepEqual(source.attachmentsOf({}), []);

// ---- file facts: read-only and bounded -----------------------------------------------------------------
const dir = await mkdtemp(join(tmpdir(), "lucid-facts-"));
try {
  const file = join(dir, "a.png");
  await writeFile(file, Buffer.alloc(1234));
  const facts = await fileFacts([file, join(dir, "gone.png"), dir, "relative/a.png", "\\\\server\\share\\a.png", `${file}\u0000.png`, 42]);
  assert.equal(facts[0].exists, true); assert.equal(facts[0].file, true); assert.equal(facts[0].size, 1234); assert.ok(facts[0].modified > 0);
  assert.equal(facts[1].exists, false); assert.equal(facts[1].reason, "missing");
  assert.equal(facts[2].directory, true); assert.equal(facts[2].file, false);
  assert.equal(facts[3].known, false, "a relative path is refused");
  assert.equal(facts[4].known, false, "a network share is refused");
  assert.equal(facts[5].known, false, "a path with a NUL is refused");
  assert.equal(facts[6].known, false, "a non-string is refused");
  assert.equal((await fileFacts([file], { remote: true }))[0].known, false, "a connected building's files are never read on this machine");
  assert.equal((await fileFacts(Array.from({ length: 20 }, () => file))).length, 8, "at most eight paths");
  assert.deepEqual(Object.keys(facts[0]).sort(), ["exists", "file", "directory", "known", "modified", "path", "size"].sort(), "only facts, never content");
} finally { await rm(dir, { recursive: true, force: true }); }

// ---- showing a delivered file: only inside the attachment folders ----------------------------------------
const { underRoots } = require("../../electron/file-facts.cjs");
const attachments = join(tmpdir(), "t3-attachments");
assert.ok(underRoots(join(attachments, "a.png"), [attachments]));
assert.ok(!underRoots(attachments, [attachments]), "the folder itself is not a file inside it");
assert.ok(!underRoots(join(attachments, "..", "secret.txt"), [attachments]), "dot-dot does not escape the folder");
assert.ok(!underRoots(`${attachments}-evil${process.platform === "win32" ? "\\" : "/"}a.png`, [attachments]), "a folder sharing the prefix is not inside");
assert.ok(!underRoots("a.png", [attachments]) && !underRoots("", [attachments]) && !underRoots(null, [attachments]));

console.log("Explorer model, file types, attachment sources and file facts passed.");
