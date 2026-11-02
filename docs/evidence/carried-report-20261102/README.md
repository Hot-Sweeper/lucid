# Reports held in the hand

Robots carry a small folded paper report in their right hand while walking and waiting for review. The page follows the existing hand joint and movement. Report titles remain in the robot tooltip. The queue recreates the paper when an actor arrives and removes it when the review ends. Ordinary question cards still work.

The user's original screenshots showed a floating title obscuring the robot and empty hands after entering the review room:

- C:/Users/tim/.t3/userdata/lucid-attachments/1793655815018-image.png
- C:/Users/tim/.t3/userdata/lucid-attachments/1793655815040-image.png

Genuine native comparison captures:

- [Before, retained production components](E:/Lucid-validation/carried-report-20261102/before-directions.png)
- [After, four directions](E:/Lucid-validation/carried-report-20261102/after-directions.png)
- [After, walking](E:/Lucid-validation/carried-report-20261102/after-walking.png)
- [After, review queue](E:/Lucid-validation/carried-report-20261102/after-queue.png)

The baseline is rebuilt from commit fb143a8441d6f2cd2fc37e31f217aee0be661416 in the same isolated native fixture. These are production robot and queue components with synthetic tasks, not a capture of a live review or changed approval state.

`node scripts/verify-carried-report-native.cjs` passed 14 checks covering all directions, running, presenting, settled waiting, refresh, release, teardown and ordinary question cards. Visual inspection confirmed the paper is held at its lower corner, stays clear of the face and remains visible from behind. `npm run verify:update` passed. Source hashes, capture hashes and validation log receipt are in [result.json](result.json).

The first setup attempt tried returning an unclonable Walker instance. A capture immediately following native resize then failed with `UnknownVizError`. The fixture now discards setup return values and allows the resized window to render. The failed resize receipt remains at E:/Lucid-validation/carried-report-20261102/failed-resize-attempt.json. No product workaround or rendering-quality change was needed.

The installed app has not been restarted or replaced by this change. Normal coordinated Update is required to load it. Existing printer sound and movement are reused; this adds static SVG geometry without a new animation timer.
