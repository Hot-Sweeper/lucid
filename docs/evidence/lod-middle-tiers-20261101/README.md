# Middle screen detail tiers

The lines and shapes tiers were still selected by zoom, but their first captures waited for idle callbacks. A busy renderer could keep the previous icon view or an empty window visible instead. Uncached zoom transitions now use animation frames with the existing 64-node and 2 ms cooperative limits. Cached transitions reuse their existing nodes; normal content refreshes remain idle work. The universal geometry renderer, sharpness and zoom thresholds are preserved.

`npm run verify:update` passed in the frozen candidate. The controller regression withholds every idle callback and verifies all four displayed tiers, bounded capture work, and cancellation of an idle wait when zoom changes.

Both native Electron comparisons exited 0. The before comparison uses the pre-fix controller with every other production source identical to the fixed snapshot. It is newly captured evidence, not historical footage. Real Files and Tasks APIs receive controlled review content. With idle callbacks withheld, before stayed on icon/empty pixels; after displayed actual lines and core shapes with app identity icons. Both apps restored their original body, first child and content. Trusted wheel events crossed and reversed all three boundaries. DPR was 1.5, document.hidden was false, and renderer error lists were empty. These checks do not establish overall FPS or p95 performance.

| View | Before | After |
| --- | --- | --- |
| Files, lines | [Capture](before/files-lines.png) | [Capture](after/files-lines.png) |
| Files, shapes | [Capture](before/files-shapes.png) | [Capture](after/files-shapes.png) |
| Tasks, lines | [Capture](before/tasks-lines.png) | [Capture](after/tasks-lines.png) |
| Tasks, shapes | [Capture](before/tasks-shapes.png) | [Capture](after/tasks-shapes.png) |

Native fixture, results, update log and source proof are retained here. Eight exact PNGs were also attached to the source thread through the supported attachment API. Commit `a9175b2` contains the fix and focused regression. The GPU slot was released. This task did not promote a shared build or restart production; executing-build proof belongs to coordinated delivery. User visual review remains separate.
