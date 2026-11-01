# Word report formatting

The report writer passed the whole assistant reply to Botword as one plain paragraph. The page consequently displayed Markdown punctuation and full link syntax. Reports now parse once into document blocks and styled runs before the existing robot typing presentation starts.

The existing ribbon, paper, typography and colors are retained. Reports support headings, bold, italic, strikethrough, inline code, nested lists, numbering, task markers, quotes, tables, code blocks and separators. Local file references show their labels with the path in the tooltip, following Lucid chat's existing policy. Web links use safe external-link attributes and visible keyboard focus. Raw HTML remains literal text; embedded pictures do not start background downloads. Imported DOCX-style runs keep their previous formatting.

Validation:

- `npm run verify:update` passed. The final successful log is retained here. An earlier attempt encountered concurrent soundtrack fixture changes; the audio owner's corrected fixture passed on retry. No audio code was changed for this task.
- `node scripts/verify-word-formatting-native.cjs E:/Lucid-validation/word-formatting-20261102/native-final` passed 18 checks. This uses the real Botword component, WM, Markdown converter and styles in an isolated offscreen Electron window, with a stub robot and a separate profile.
- Native checks cover the exact screenshot report, rich formatting, unsafe markup and link attributes, entities, narrow long-text wrapping, actual keyboard link focus, typed completion, retained imported runs and exact executing V8 bundle equality. Native tests also caught and fixed code-block text losing line breaks.
- No production UI interaction, update promotion, restart or remote request occurred. These captures prove the isolated component, not installation in the currently running office. The broader stabilization review remains unsettled.

Visual evidence:

- [Before, reconstructed original title-plus-plain-paragraph input](before-raw-markdown.png)
- [After, the same report with formatting](after-formatted-report.png)
- [Headings and nested lists](after-document-formatting.png)
- [Table, code, links and literal unsafe markup](after-document-code-and-links.png)
- [Narrow window with a long path](after-narrow-long-path.png)
- [Completed robot typing with formatting retained](after-typed-document.png)

The before capture uses the original report input shape with the same component. It is not a historical production screenshot. All captures are unedited Electron captures. `source-proof.json`, `tested-source.json` and `results.json` retain the tested source hashes, fixture boundary and executing bundle proof. The helper and source are ready for inclusion in the next coordinated update after the active room/robot edits finish.
