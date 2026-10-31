// Reads office documents the agents wrote so the robots' office apps can show the real content.
// docx, xlsx, pptx and odt are zip files with XML inside: a tiny zip reader (central directory
// plus zlib.inflateRawSync) and a few regexes pull out paragraphs, cells and slides. csv, tsv
// and rtf are plain text. Everything runs in a worker with size limits and a timeout, and the
// handler never throws: it answers { ok: true, doc } or { ok: false, error }.
const path = require("node:path");

const TIMEOUT_MS = 5000;
const EXTS = new Set([".docx", ".doc", ".rtf", ".odt", ".xlsx", ".xls", ".csv", ".tsv", ".pptx", ".ppt", ".key"]);

// Everything inside this function runs in the worker thread, so it only uses Node built-ins.
function parseDoc(file) {
  const fs = require("node:fs");
  const zlib = require("node:zlib");
  const pathM = require("node:path");
  const MAX_FILE = 30 * 1024 * 1024;    // bigger files are not opened at all
  const MAX_ENTRY = 12 * 1024 * 1024;   // largest XML part we inflate
  const MAX_ROWS = 30, MAX_COLS = 12, MAX_BLOCKS = 400, MAX_SLIDES = 60, MAX_TEXT = 2000;
  const MAX_IMG = 450 * 1024, MAX_IMG_TOTAL = 2.5 * 1024 * 1024;

  const ext = pathM.extname(file).toLowerCase();
  const name = pathM.basename(file);

  // --- zip ---------------------------------------------------------------------
  function openZip(buf) {
    const min = Math.max(0, buf.length - 65557);
    let eocd = -1;
    for (let i = buf.length - 22; i >= min; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error("not a zip file");
    const count = buf.readUInt16LE(eocd + 10);
    let p = buf.readUInt32LE(eocd + 16);
    if (p === 0xffffffff) throw new Error("zip64 is not supported");
    const entries = new Map();
    for (let n = 0; n < count && p + 46 <= buf.length; n++) {
      if (buf.readUInt32LE(p) !== 0x02014b50) break;
      const method = buf.readUInt16LE(p + 10);
      const csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
      const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
      const local = buf.readUInt32LE(p + 42);
      const ename = buf.toString("utf8", p + 46, p + 46 + nlen);
      entries.set(ename, { method, csize, usize, local });
      p += 46 + nlen + xlen + clen;
    }
    const raw = (ename) => {
      const e = entries.get(ename);
      if (!e || e.usize > MAX_ENTRY || e.local + 30 > buf.length) return null;
      if (buf.readUInt32LE(e.local) !== 0x04034b50) return null;
      const start = e.local + 30 + buf.readUInt16LE(e.local + 26) + buf.readUInt16LE(e.local + 28);
      const data = buf.subarray(start, start + e.csize);
      if (e.method === 0) return data;
      if (e.method === 8) return zlib.inflateRawSync(data, { maxOutputLength: MAX_ENTRY });
      return null;
    };
    return {
      names: () => [...entries.keys()],
      has: (n) => entries.has(n),
      raw,
      text: (n) => { const b = raw(n); return b ? b.toString("utf8") : null; },
      size: (n) => entries.get(n)?.usize ?? 0,
    };
  }

  // --- xml helpers ---------------------------------------------------------------
  const decode = (s) => String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeChar(Number(d)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  function safeChar(n) { try { return String.fromCodePoint(n); } catch { return ""; } }
  const attr = (tag, a) => { const m = tag.match(new RegExp(`\\s${a}="([^"]*)"`)); return m ? decode(m[1]) : null; };
  const all = (xml, re) => { const out = []; let m; re.lastIndex = 0; while ((m = re.exec(xml))) out.push(m); return out; };
  const clip = (s) => (s.length > MAX_TEXT ? s.slice(0, MAX_TEXT) : s);
  // relationship id -> target, resolved against the part's folder
  function rels(zip, part) {
    const dir = pathM.posix.dirname(part);
    const relPart = `${dir}/_rels/${pathM.posix.basename(part)}.rels`;
    const xml = zip.text(relPart) || "";
    const map = new Map();
    for (const m of all(xml, /<Relationship\b[^>]*>/g)) {
      const id = attr(m[0], "Id"), target = attr(m[0], "Target");
      if (!id || !target || attr(m[0], "TargetMode") === "External") continue;
      map.set(id, target.startsWith("/") ? target.slice(1) : pathM.posix.normalize(`${dir}/${target}`));
    }
    return map;
  }

  // --- Word --------------------------------------------------------------------------
  function readDocx(zip) {
    const xml = zip.text("word/document.xml");
    if (!xml) throw new Error("no document.xml");
    // numbering: which lists are bullets and which are numbered
    const numFmt = new Map();
    const numXml = zip.text("word/numbering.xml") || "";
    const abstract = new Map();
    for (const m of all(numXml, /<w:abstractNum\b[^>]*w:abstractNumId="(\d+)"[^>]*>([\s\S]*?)<\/w:abstractNum>/g)) {
      const lv = new Map();
      for (const l of all(m[2], /<w:lvl\b[^>]*w:ilvl="(\d+)"[^>]*>([\s\S]*?)<\/w:lvl>/g)) lv.set(Number(l[1]), (l[2].match(/<w:numFmt\b[^>]*w:val="([^"]+)"/) || [])[1] || "bullet");
      abstract.set(m[1], lv);
    }
    for (const m of all(numXml, /<w:num\b[^>]*w:numId="(\d+)"[^>]*>([\s\S]*?)<\/w:num>/g)) {
      const a = (m[2].match(/<w:abstractNumId\b[^>]*w:val="(\d+)"/) || [])[1];
      if (a && abstract.has(a)) numFmt.set(m[1], abstract.get(a));
    }
    // style ids to readable names (Heading1, Title, ListBullet...)
    const styleName = new Map();
    for (const m of all(zip.text("word/styles.xml") || "", /<w:style\b[^>]*w:styleId="([^"]+)"[^>]*>([\s\S]*?)<\/w:style>/g)) {
      const n = (m[2].match(/<w:name\b[^>]*w:val="([^"]+)"/) || [])[1];
      if (n) styleName.set(m[1], decode(n));
    }
    const on = (rpr, tag) => { const m = rpr.match(new RegExp(`<w:${tag}(?:\\s[^>]*)?/>`)); return !!m && !/w:val="(0|false|none)"/.test(m[0]); };
    function runs(pxml) {
      const out = [];
      for (const r of all(pxml, /<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g)) {
        const rpr = (r[1].match(/<w:rPr>([\s\S]*?)<\/w:rPr>/) || [])[1] || "";
        let t = "";
        for (const piece of all(r[1], /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>/g)) t += piece[1] != null ? decode(piece[1]) : piece[0] === "<w:tab/>" ? "\t" : "\n";
        if (!t) continue;
        const b = on(rpr, "b"), i = on(rpr, "i"), u = /<w:u\s[^>]*w:val="(?!none)/.test(rpr);
        const last = out[out.length - 1];
        if (last && last.b === b && last.i === i && last.u === u) last.t += t; else out.push({ t, b, i, u });
      }
      return out;
    }
    function para(pxml) {
      const ppr = (pxml.match(/<w:pPr>([\s\S]*?)<\/w:pPr>/) || [])[1] || "";
      const sid = (ppr.match(/<w:pStyle\b[^>]*w:val="([^"]+)"/) || [])[1] || "";
      const sname = (styleName.get(sid) || sid).toLowerCase().replace(/\s+/g, "");
      const align = (ppr.match(/<w:jc\b[^>]*w:val="([^"]+)"/) || [])[1];
      const rs = runs(pxml);
      const text = clip(rs.map((r) => r.t).join(""));
      const block = { text, runs: rs.length > 1 || rs.some((r) => r.b || r.i || r.u) ? rs : undefined, align: align === "center" || align === "right" || align === "both" ? (align === "both" ? "justify" : align) : undefined };
      const hm = sname.match(/^heading(\d)/);
      if (sname === "title") return { kind: "h", level: 0, ...block };
      if (sname === "subtitle") return { kind: "h", level: 3, sub: true, ...block };
      if (hm) return { kind: "h", level: Math.min(4, Number(hm[1])), ...block };
      const numId = (ppr.match(/<w:numId\b[^>]*w:val="(\d+)"/) || [])[1];
      const ilvl = Number((ppr.match(/<w:ilvl\b[^>]*w:val="(\d+)"/) || [])[1] || 0);
      if ((numId && numId !== "0") || /^list(bullet|number|paragraph)/.test(sname)) {
        const fmt = numId ? numFmt.get(numId)?.get(ilvl) : undefined;
        const ordered = fmt ? fmt !== "bullet" && fmt !== "none" : /^listnumber/.test(sname);
        return { kind: "li", ordered, level: Math.min(4, ilvl + (Number((sname.match(/(\d)$/) || [])[1] || 1) - 1)), ...block };
      }
      if (/^(quote|intensequote)$/.test(sname)) return { kind: "p", quote: true, ...block };
      return { kind: "p", ...block };
    }
    const body = (xml.match(/<w:body>([\s\S]*)<\/w:body>/) || [])[1] || xml;
    const blocks = [];
    let truncated = false;
    for (const m of all(body, /<w:tbl\b[\s\S]*?<\/w:tbl>|<w:p\b[^>]*\/>|<w:p\b[\s\S]*?<\/w:p>/g)) {
      if (blocks.length >= MAX_BLOCKS) { truncated = true; break; }
      const x = m[0];
      if (x.startsWith("<w:tbl")) {
        const rows = all(x, /<w:tr\b[\s\S]*?<\/w:tr>/g).slice(0, MAX_ROWS).map((tr) =>
          all(tr[0], /<w:tc\b[\s\S]*?<\/w:tc>/g).slice(0, MAX_COLS).map((tc) =>
            clip(all(tc[0], /<w:p\b[\s\S]*?<\/w:p>/g).map((p) => runs(p[0]).map((r) => r.t).join("")).join("\n"))));
        if (rows.length) blocks.push({ kind: "table", rows });
        continue;
      }
      if (/<w:drawing\b|<w:pict\b/.test(x)) blocks.push({ kind: "img" });
      const p = para(x);
      // keep at most one empty paragraph in a row: documents use them as spacing
      if (!p.text.trim() && (!blocks.length || (blocks[blocks.length - 1].kind === "p" && !blocks[blocks.length - 1].text.trim()))) continue;
      blocks.push(p);
    }
    while (blocks.length && blocks[blocks.length - 1].kind === "p" && !blocks[blocks.length - 1].text.trim()) blocks.pop();
    return { kind: "word", name, blocks, truncated };
  }

  // --- OpenDocument text ------------------------------------------------------------------
  function readOdt(zip) {
    const xml = zip.text("content.xml");
    if (!xml) throw new Error("no content.xml");
    const body = (xml.match(/<office:text\b[^>]*>([\s\S]*)<\/office:text>/) || [])[1] || "";
    const txt = (s) => clip(decode(s.replace(/<text:tab\/>/g, "\t").replace(/<text:line-break\/>/g, "\n").replace(/<text:s(?:\s[^>]*)?\/>/g, " ").replace(/<[^>]+>/g, "")));
    const blocks = [];
    for (const m of all(body, /<table:table\b[\s\S]*?<\/table:table>|<text:list\b[\s\S]*?<\/text:list>|<text:h\b[^>]*>[\s\S]*?<\/text:h>|<text:p\b[^>]*>[\s\S]*?<\/text:p>/g)) {
      if (blocks.length >= MAX_BLOCKS) break;
      const x = m[0];
      if (x.startsWith("<table:table")) {
        const rows = all(x, /<table:table-row\b[\s\S]*?<\/table:table-row>/g).slice(0, MAX_ROWS).map((r) => all(r[0], /<table:table-cell\b[\s\S]*?<\/table:table-cell>|<table:table-cell\b[^>]*\/>/g).slice(0, MAX_COLS).map((c) => txt(c[0])));
        if (rows.length) blocks.push({ kind: "table", rows });
      } else if (x.startsWith("<text:list")) {
        for (const li of all(x, /<text:list-item\b[\s\S]*?<\/text:list-item>/g)) blocks.push({ kind: "li", ordered: false, level: 0, text: txt(li[0]) });
      } else if (x.startsWith("<text:h")) {
        blocks.push({ kind: "h", level: Math.min(4, Number(attr(x, "text:outline-level") || 1)), text: txt(x) });
      } else {
        const t = txt(x);
        if (t.trim() || (blocks.length && blocks[blocks.length - 1].text?.trim())) blocks.push({ kind: "p", text: t });
      }
    }
    return { kind: "word", name, blocks, truncated: blocks.length >= MAX_BLOCKS };
  }

  // --- RTF -------------------------------------------------------------------------------------
  function readRtf(text) {
    let s = text.slice(0, 2 * 1024 * 1024);
    // drop the header groups (fonts, colours, styles, info) and any {\* ...} destinations
    for (let i = 0, prev = ""; i < 8 && prev !== s; i++) { prev = s; s = s.replace(/\{\\(?:\*|fonttbl|colortbl|stylesheet|info|listtable|listoverridetable|pict|header|footer)[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, ""); }
    s = s.replace(/\\'([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\u(-?\d+)\??/g, (_, n) => safeChar(Number(n) < 0 ? Number(n) + 65536 : Number(n)))
      .replace(/\\(par|line)\b ?/g, "\n").replace(/\\tab\b ?/g, "\t")
      .replace(/\\[a-z]+-?\d* ?/gi, "").replace(/\\([{}\\])/g, "$1").replace(/[{}]/g, "");
    const blocks = s.split(/\n/).map((l) => l.replace(/\r/g, "")).filter((l, i, a) => l.trim() || (i > 0 && a[i - 1].trim())).slice(0, MAX_BLOCKS).map((t) => ({ kind: "p", text: clip(t) }));
    return { kind: "word", name, blocks, truncated: false };
  }

  // --- spreadsheets ------------------------------------------------------------------------------
  const colIndex = (ref) => { const m = ref.match(/^([A-Z]+)/); let n = 0; for (const ch of m ? m[1] : "A") n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  function readXlsx(zip) {
    const shared = [];
    for (const si of all(zip.text("xl/sharedStrings.xml") || "", /<si>([\s\S]*?)<\/si>/g)) {
      shared.push(clip(all(si[1], /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g).map((t) => decode(t[1])).join("")));
      if (shared.length > 200000) break;
    }
    // sheet names in workbook order, and the first sheet's part
    const wb = zip.text("xl/workbook.xml") || "";
    const wbRels = rels(zip, "xl/workbook.xml");
    const sheets = all(wb, /<sheet\b[^>]*>/g).map((m) => ({ name: attr(m[0], "name") || "Sheet", rid: attr(m[0], "r:id") }));
    const first = sheets[0];
    let part = first?.rid ? wbRels.get(first.rid) : null;
    if (!part || !zip.has(part)) part = zip.names().filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort((a, b) => Number(a.match(/(\d+)\.xml$/)[1]) - Number(b.match(/(\d+)\.xml$/)[1]))[0];
    const xml = part ? zip.text(part) : null;
    if (!xml) throw new Error("no worksheet");
    // percent and date formats, so 0.25 shows as 25% the way the sheet would
    const styles = zip.text("xl/styles.xml") || "";
    const customFmt = new Map(all(styles, /<numFmt\b[^>]*>/g).map((m) => [attr(m[0], "numFmtId"), attr(m[0], "formatCode") || ""]));
    const xfs = (((styles.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/) || [])[1]) || "");
    const xfFmt = all(xfs, /<xf\b[^>]*>/g).map((m) => { const id = attr(m[0], "numFmtId") || "0"; return { id: Number(id), code: customFmt.get(id) || "" }; });
    const fmtOf = (s) => {
      const x = xfFmt[Number(s)];
      if (!x) return undefined;
      if (x.id === 9 || x.id === 10 || /%/.test(x.code)) return "pct";
      if ((x.id >= 14 && x.id <= 22) || /(^|[^"\\])[dmy]{1,4}[-/. ][dmy]/i.test(x.code)) return "date";
      if (x.id === 4 || x.id === 2 || /0\.00/.test(x.code)) return "fixed2";
      if (/[$€£¥]/.test(x.code)) return "money";
      return undefined;
    };
    const rows = [];
    let maxCol = 0, totalRows = 0;
    for (const r of all(xml, /<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b([^>]*)\/>/g)) {
      const rn = Number(attr(r[0], "r") || totalRows + 1);
      totalRows = Math.max(totalRows, rn);
      if (rn > MAX_ROWS || !r[2]) continue;
      const row = rows[rn - 1] || (rows[rn - 1] = []);
      for (const c of all(r[2], /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = attr(c[0], "r") || "";
        const ci = ref ? colIndex(ref) : row.length;
        if (ci >= MAX_COLS) continue;
        const t = attr(c[0], "t"), s = attr(c[0], "s");
        const inner = c[2] || "";
        const f = (inner.match(/<f(?:\s[^>]*)?>([\s\S]*?)<\/f>/) || [])[1];
        const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        let cell = null;
        if (t === "s" && v != null) cell = { v: shared[Number(v)] ?? "" };
        else if (t === "inlineStr") cell = { v: clip(all(inner, /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g).map((x) => decode(x[1])).join("")) };
        else if (t === "str" || t === "e") cell = { v: v != null ? decode(v) : "" };
        else if (t === "b") cell = { v: v === "1" ? "TRUE" : "FALSE" };
        else if (v != null && v !== "") cell = { v: decode(v), n: Number(v) };
        else if (f != null) cell = { v: "" };
        if (!cell) continue;
        if (f != null) cell.f = "=" + decode(f);
        const fmt = s != null ? fmtOf(s) : undefined;
        if (fmt) cell.fmt = fmt;
        row[ci] = cell;
        maxCol = Math.max(maxCol, ci + 1);
      }
    }
    for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
    const dim = (xml.match(/<dimension\b[^>]*ref="([^"]+)"/) || [])[1];
    // a chart already in the workbook (its type), so the robot's sheet shows one too
    const chartPart = zip.names().find((n) => /^xl\/charts\/chart\d+\.xml$/.test(n));
    const chartXml = chartPart && zip.size(chartPart) < 2e6 ? zip.text(chartPart) || "" : "";
    const chart = chartXml ? ((chartXml.match(/<(?:c:)?(bar|line|pie|area|scatter|doughnut)Chart>/) || [])[1] || "bar") : undefined;
    const chartTitle = chartXml ? clip(all((chartXml.match(/<(?:c:)?title>([\s\S]*?)<\/(?:c:)?title>/) || [])[1] || "", /<a:t>([\s\S]*?)<\/a:t>/g).map((m) => decode(m[1])).join("")) : "";
    // which columns the chart plots (its value references) and labels it with (its categories)
    const refCol = (f) => { const m = String(f).match(/\$?([A-Z]{1,3})\$?\d+/); return m ? colIndex(m[1]) : -1; };
    const chartCols = chartXml ? [...new Set(all(chartXml, /<(?:c:)?val>[\s\S]*?<(?:c:)?f>([^<]+)<\/(?:c:)?f>/g).map((m) => refCol(decode(m[1]).split("!").pop())).filter((c) => c >= 0 && c < MAX_COLS))] : [];
    const catRef = chartXml ? (chartXml.match(/<(?:c:)?cat>[\s\S]*?<(?:c:)?f>([^<]+)<\/(?:c:)?f>/) || [])[1] : null;
    const chartCat = catRef ? refCol(decode(catRef).split("!").pop()) : -1;
    return { kind: "sheet", name, sheets: sheets.length ? sheets.map((x) => x.name) : ["Sheet1"], active: 0, rows, cols: maxCol, totalRows, dim, chart, chartTitle: chartTitle || undefined, chartCols: chartCols.length ? chartCols : undefined, chartCat: chartCat >= 0 ? chartCat : undefined };
  }
  function readDelimited(text, sep) {
    const src = text.replace(/^\uFEFF/, "");
    if (!sep) {
      const head = src.split(/\r?\n/, 1)[0] || "";
      sep = (head.match(/;/g) || []).length > (head.match(/,/g) || []).length ? ";" : ",";
    }
    const rows = [];
    let row = [], cur = "", q = false, totalRows = 0, i = 0;
    const push = () => { if (row.length < MAX_COLS) row.push(cur); cur = ""; };
    for (; i < src.length; i++) {
      const ch = src[i];
      if (q) { if (ch === '"') { if (src[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; continue; }
      if (ch === '"' && cur === "") q = true;
      else if (ch === sep) push();
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && src[i + 1] === "\n") i++;
        push(); totalRows++;
        if (rows.length < MAX_ROWS) rows.push(row);
        row = [];
      } else cur += ch;
    }
    if (cur || row.length) { push(); totalRows++; if (rows.length < MAX_ROWS) rows.push(row); }
    let cols = 0;
    const cells = rows.map((r) => r.map((v) => {
      const s = clip(v);
      // a decimal comma only in semicolon files (European exports); "1,234" in a comma file stays text
      const numRe = sep === ";" ? /^\s*-?(\d+([.,]\d+)?|\.\d+)(e[+-]?\d+)?\s*$/i : /^\s*-?(\d+(\.\d+)?|\.\d+)(e[+-]?\d+)?\s*$/i;
      const num = numRe.test(s) ? Number(s.trim().replace(",", ".")) : NaN;
      return s === "" ? null : Number.isFinite(num) ? { v: s.trim(), n: num } : { v: s };
    }));
    for (const r of cells) cols = Math.max(cols, r.length);
    return { kind: "sheet", name, sheets: [name.replace(/\.[^.]+$/, "")], active: 0, rows: cells, cols, totalRows };
  }

  // --- slides -------------------------------------------------------------------------------------
  function readPptx(zip) {
    const pres = zip.text("ppt/presentation.xml") || "";
    const sz = pres.match(/<p:sldSz\b[^>]*>/);
    const W = sz ? Number(attr(sz[0], "cx")) || 12192000 : 12192000, H = sz ? Number(attr(sz[0], "cy")) || 6858000 : 6858000;
    const presRels = rels(zip, "ppt/presentation.xml");
    let parts = all(pres, /<p:sldId\b[^>]*>/g).map((m) => presRels.get(attr(m[0], "r:id"))).filter((p) => p && zip.has(p));
    if (!parts.length) parts = zip.names().filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => Number(a.match(/(\d+)\.xml$/)[1]) - Number(b.match(/(\d+)\.xml$/)[1]));
    const totalSlides = parts.length;
    let imgBytes = 0;
    const paras = (txBody) => all(txBody, /<a:p>([\s\S]*?)<\/a:p>|<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g).map((p) => {
      const inner = p[1] ?? p[2] ?? "";
      const lvl = Number((inner.match(/<a:pPr\b[^>]*lvl="(\d+)"/) || [])[1] || 0);
      const bold = /<a:rPr\b[^>]*\sb="1"/.test(inner);
      const text = clip(all(inner, /<a:t>([\s\S]*?)<\/a:t>|<a:br\/>/g).map((t) => (t[1] != null ? decode(t[1]) : "\n")).join(""));
      const bullet = /<a:buNone\/>/.test(inner) ? false : /<a:buAutoNum\b/.test(inner) ? "num" : undefined;
      return { text, lvl, bold: bold || undefined, bullet };
    });
    const box = (x) => {
      const off = x.match(/<a:off\b[^>]*>/), ext = x.match(/<a:ext\b[^>]*cx="[^"]*"[^>]*>/);
      if (!off || !ext) return undefined;
      const r = (v) => Math.round(v * 1000) / 1000;
      return { x: r(Number(attr(off[0], "x")) / W), y: r(Number(attr(off[0], "y")) / H), w: r(Number(attr(ext[0], "cx")) / W), h: r(Number(attr(ext[0], "cy")) / H) };
    };
    const fillOf = (x) => { const sp = (x.match(/<p:spPr\b[^>]*>([\s\S]*?)<\/p:spPr>/) || [])[1] || ""; const m = sp.match(/<a:solidFill>\s*<a:srgbClr val="([0-9A-Fa-f]{6})"/); return m ? "#" + m[1].toLowerCase() : undefined; };
    const slides = [];
    for (const part of parts.slice(0, MAX_SLIDES)) {
      const xml = zip.text(part) || "";
      const sRels = rels(zip, part);
      const els = [];
      let title = "";
      const bg = (xml.match(/<p:bg>[\s\S]*?<a:srgbClr val="([0-9A-Fa-f]{6})"/) || [])[1];
      for (const m of all(xml, /<p:sp>[\s\S]*?<\/p:sp>|<p:sp\b[^>]*>[\s\S]*?<\/p:sp>|<p:pic>[\s\S]*?<\/p:pic>|<p:pic\b[^>]*>[\s\S]*?<\/p:pic>/g)) {
        if (els.length >= 24) break;
        const x = m[0];
        if (x.startsWith("<p:pic")) {
          const rid = (x.match(/<a:blip\b[^>]*r:embed="([^"]+)"/) || [])[1];
          const media = rid ? sRels.get(rid) : null;
          let src;
          const mext = media ? pathM.extname(media).toLowerCase() : "";
          const type = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif" }[mext];
          if (media && type && zip.size(media) <= MAX_IMG && imgBytes + zip.size(media) <= MAX_IMG_TOTAL) {
            const b = zip.raw(media);
            if (b) { imgBytes += b.length; src = `data:${type};base64,${b.toString("base64")}`; }
          }
          els.push({ kind: "pic", box: box(x), src });
          continue;
        }
        const ph = x.match(/<p:ph\b[^>]*\/?>/);
        const phType = ph ? attr(ph[0], "type") || "body" : null;
        const tx = (x.match(/<p:txBody>([\s\S]*?)<\/p:txBody>/) || [])[1];
        const ps = tx ? paras(tx).filter((p, i, a) => p.text.trim() || (i > 0 && i < a.length - 1)) : [];
        const prst = (x.match(/<a:prstGeom\b[^>]*prst="([^"]+)"/) || [])[1];
        const kind = phType === "title" || phType === "ctrTitle" ? "title" : phType === "subTitle" ? "subtitle" : phType ? (phType === "body" || phType === "obj" ? "body" : null) : ps.length ? "text" : prst ? "shape" : null;
        if (!kind) continue;   // dates, slide numbers, footers
        if (kind === "title" && !title) title = ps.map((p) => p.text).join(" ").trim();
        if ((kind === "title" || kind === "subtitle" || kind === "body") && !ps.some((p) => p.text.trim())) continue;
        els.push({ kind, box: box(x), paras: ps.length ? ps : undefined, prst: prst || undefined, fill: fillOf(x), center: ph ? undefined : /<a:pPr\b[^>]*algn="ctr"/.test(x) || undefined });
      }
      // speaker notes
      let notes = "";
      for (const target of sRels.values()) {
        if (!/notesSlide\d+\.xml$/.test(target)) continue;
        const nx = zip.text(target) || "";
        for (const sp of all(nx, /<p:sp>[\s\S]*?<\/p:sp>|<p:sp\b[^>]*>[\s\S]*?<\/p:sp>/g)) {
          const ph = sp[0].match(/<p:ph\b[^>]*>/);
          if (!ph || (attr(ph[0], "type") || "body") !== "body") continue;
          notes = clip(all(sp[0], /<a:t>([\s\S]*?)<\/a:t>/g).map((t) => decode(t[1])).join(" ").trim());
        }
      }
      slides.push({ title, els, notes: notes || undefined, bg: bg ? "#" + bg.toLowerCase() : undefined });
    }
    return { kind: "deck", name, aspect: Math.round((W / H) * 1000) / 1000, slides, totalSlides };
  }

  // --- dispatch ----------------------------------------------------------------------------------
  const st = fs.statSync(file);
  if (!st.isFile()) throw new Error("not a file");
  if (st.size > MAX_FILE) throw new Error("file is too large");
  const base = { size: st.size, mtime: st.mtimeMs };
  if (ext === ".csv" || ext === ".tsv") {
    const fd = fs.openSync(file, "r");
    try {
      const buf = Buffer.alloc(Math.min(st.size, 2 * 1024 * 1024));
      fs.readSync(fd, buf, 0, buf.length, 0);
      return { ...readDelimited(buf.toString("utf8"), ext === ".tsv" ? "\t" : null), ...base };
    } finally { fs.closeSync(fd); }
  }
  if (ext === ".rtf") return { ...readRtf(fs.readFileSync(file, "latin1")), ...base };
  if (ext === ".doc" || ext === ".xls" || ext === ".ppt" || ext === ".key") throw new Error("this format can not be previewed");
  const zip = openZip(fs.readFileSync(file));
  if (ext === ".docx") return { ...readDocx(zip), ...base };
  if (ext === ".odt") return { ...readOdt(zip), ...base };
  if (ext === ".xlsx") return { ...readXlsx(zip), ...base };
  if (ext === ".pptx") return { ...readPptx(zip), ...base };
  throw new Error("unsupported file type");
}

// The worker: parse one file, post the result, exit.
function workerMain() {
  const { parentPort, workerData } = require("node:worker_threads");
  try {
    // eslint-disable-next-line no-new-func
    const parse = new Function("return " + workerData.src)();
    parentPort.postMessage({ ok: true, doc: parse(workerData.file) });
  } catch (err) {
    parentPort.postMessage({ ok: false, error: String((err && err.message) || err) });
  }
}

function readDoc(p) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (r) => { if (!done) { done = true; resolve(r); } };
    try {
      if (typeof p !== "string" || !p || p.length > 1024) return finish({ ok: false, error: "bad path" });
      const file = path.resolve(p);
      if (!EXTS.has(path.extname(file).toLowerCase())) return finish({ ok: false, error: "not an office document" });
      const { Worker } = require("node:worker_threads");
      const w = new Worker(`(${workerMain.toString()})()`, { eval: true, workerData: { file, src: parseDoc.toString() }, resourceLimits: { maxOldGenerationSizeMb: 256 } });
      const timer = setTimeout(() => { finish({ ok: false, error: "timed out" }); void w.terminate(); }, TIMEOUT_MS);
      w.once("message", (r) => { clearTimeout(timer); finish(r); void w.terminate(); });
      w.once("error", (err) => { clearTimeout(timer); finish({ ok: false, error: String(err?.message || err) }); });
      w.once("exit", () => { clearTimeout(timer); finish({ ok: false, error: "reader stopped" }); });
    } catch (err) {
      finish({ ok: false, error: String(err?.message || err) });
    }
  });
}

function register(ipcMain) {
  ipcMain.handle("doc:read", (_e, p) => readDoc(p).catch((err) => ({ ok: false, error: String(err?.message || err) })));
}

module.exports = { register, readDoc, parseDoc };
