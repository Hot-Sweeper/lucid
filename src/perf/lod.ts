// One set of distances for every level of detail in the office, measured in real screen pixels
// (device pixels) of a desk's monitor, which is 276 world units wide. Earlier each system had
// its own number, some in page pixels and some in camera zoom, so on a high-density display
// they switched at different and too-early distances.
//
//   full   ≥ 440 px  app text is readable (13 px app text lands at about 7 device px)
//   lines  ≥ 300 px  text becomes line shapes; the desk's status sign replaces small panels
//   shapes ≥ 190 px  layout blocks, pictures and soft text bars
//   icon   < 190 px  the same layout under the app's icon; robots are drawn on their canvas
//   tiny   <  70 px  the dock row is skipped and background motion slows down
export const MONITOR_UNITS = 276;
export const LOD_PX = { tiny: 70, icon: 190, shapes: 300, full: 440 } as const;

/** Device pixels per page pixel; 1 outside a browser (checks). */
export const pixelRatio = () => (typeof devicePixelRatio === "number" && devicePixelRatio > 0 ? devicePixelRatio : 1);
/** How wide a desk's monitor is on screen, in device pixels, at this camera zoom. */
export const monitorPx = (scale: number) => MONITOR_UNITS * scale * pixelRatio();
/** The camera zoom at which a monitor is this many device pixels wide. */
export const zoomForMonitorPx = (px: number) => px / (MONITOR_UNITS * pixelRatio());
