# Bounded outdoor presentation

The previous scenery cache kept its bitmap buffers small, but its displayed overview canvas and live SVG still had grounds-sized CSS boxes. Chromium's actual layer report showed both at 25,827 by 16,662 CSS pixels. Small backing buffers alone did not bound compositing and overlap work.

`OutsideRaster` now keeps its overview and sharp crop/history buffers off DOM. Only two viewport-sized display canvases enter the world, each at actual device pixel ratio. An inverse camera plane inside the existing grounds anchor cancels the outer camera transform. Display boxes therefore stay at scene dimensions while their source image maps to the same world coordinates. The original grounds clip, night tint ordering, park placement and CSS variable inheritance remain intact.

The same live SVG remains connected to its existing ambient observers and animation clocks. Its viewBox follows the current local ground viewport and its displayed width/height match the scene. No animation reset, tiled image seam, simplified artwork or quality reduction is introduced. Source replacement snapshots the previous displayed bitmap while the new source decodes.

Sharp raster crops retain the existing screen-density generation, overscan, two-entry history, asynchronous installation and stale-job protection. `data-source-density` and `data-sharp` on the detail display expose the actual installed source's density/coverage for runtime tests. A viewport-sized output buffer by itself is no longer sufficient proof of sharp source content.

`node scripts/verify-outside-viewport.mjs` verifies fractional camera alignment from 0.02x through 6x, clipped source mapping, device-resolution output dimensions, bounded live SVG dimensions, off-DOM source buffers, sharp source coverage and cleanup. Whole-project TypeScript passes. Actual Chromium layer bounds, appearance and frame times are verified by the coordinator's combined runtime run.
