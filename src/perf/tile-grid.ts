export type TileRect = { x: number; y: number; w: number; h: number };
export type RasterTile = { key: string; density: number; column: number; row: number; width: number; height: number; core: TileRect; crop: TileRect & { density: number } };
export const RASTER_TILE_PIXELS = 512;
export const RASTER_TILE_GUARD = 1;
export const upwardTileDensity = (required: number) => Math.max(required, 2 ** (Math.ceil(Math.log2(Math.max(required, 1 / 1024)) * 4) / 4));
/** Device emulation can report a few floating-point bits beyond the physical
 * scale. Canonicalize only that noise for hard clips, never source density. */
export function clipPixelRatio(dpr: number) {
  const rounded=Math.round(dpr*1e6)/1e6;
  return Math.abs(rounded-dpr)<=1e-7?rounded:dpr;
}

/** Adjacent ready cores and native holes use these same global physical edges.
 * Keep the bitmap at its original world geometry; only its hard clip changes.
 * origin is the scene's CSS position, including its fractional screen phase. */
export function snapTileCore(core: TileRect, cam: { x: number; y: number; s: number }, dpr: number, origin = { x: 0, y: 0 }) {
  const pixelRatio=clipPixelRatio(dpr);
  // Normalize arithmetic noise at an exact half-pixel tie, so x+w on the left
  // cell and x on the right cell cannot choose opposite sides of that tie.
  const edge = (value: number) => Math.round(Math.round(value * 1e8) / 1e8);
  const x = edge((origin.x + cam.x + core.x * cam.s) * pixelRatio), y = edge((origin.y + cam.y + core.y * cam.s) * pixelRatio);
  const right = edge((origin.x + cam.x + (core.x + core.w) * cam.s) * pixelRatio), bottom = edge((origin.y + cam.y + (core.y + core.h) * cam.s) * pixelRatio);
  return {
    world: { x: (x / pixelRatio - origin.x - cam.x) / cam.s, y: (y / pixelRatio - origin.y - cam.y) / cam.s, w: (right - x) / (pixelRatio * cam.s), h: (bottom - y) / (pixelRatio * cam.s) },
    pixels: { x, y, w: right - x, h: bottom - y },
    pixelRatio,
  };
}

/** Source-aligned cells retain their identity while the camera translates. The
 * guarded image is sampled at its full density; only its nonoverlapping core is
 * displayed, so transparent artwork is never painted twice. */
export function planRasterTiles(bounds: TileRect, view: TileRect, requiredDensity: number, overscanWorld = 0): RasterTile[] {
  if (!(requiredDensity > 0 && view.w > 0 && view.h > 0 && bounds.w > 0 && bounds.h > 0)) return [];
  const density = upwardTileDensity(requiredDensity), size = RASTER_TILE_PIXELS / density;
  const x0 = Math.max(bounds.x, view.x - overscanWorld), y0 = Math.max(bounds.y, view.y - overscanWorld);
  const x1 = Math.min(bounds.x + bounds.w, view.x + view.w + overscanWorld), y1 = Math.min(bounds.y + bounds.h, view.y + view.h + overscanWorld);
  if (x1 <= x0 || y1 <= y0) return [];
  const result: RasterTile[] = [], lod = Math.round(Math.log2(density) * 4);
  for (let row = Math.floor(y0 / size); row < Math.ceil(y1 / size - 1e-10); row++) {
    for (let column = Math.floor(x0 / size); column < Math.ceil(x1 / size - 1e-10); column++) {
      const left = column * size, top = row * size;
      const x = Math.max(bounds.x, left), y = Math.max(bounds.y, top);
      const right = Math.min(bounds.x + bounds.w, (column + 1) * size), bottom = Math.min(bounds.y + bounds.h, (row + 1) * size);
      result.push({ key: `${lod}:${column}:${row}`, density, column, row,
        width: RASTER_TILE_PIXELS + RASTER_TILE_GUARD * 2, height: RASTER_TILE_PIXELS + RASTER_TILE_GUARD * 2,
        core: { x, y, w: right - x, h: bottom - y },
        crop: { x: left - RASTER_TILE_GUARD / density, y: top - RASTER_TILE_GUARD / density,
          w: (RASTER_TILE_PIXELS + RASTER_TILE_GUARD * 2) / density, h: (RASTER_TILE_PIXELS + RASTER_TILE_GUARD * 2) / density, density },
      });
    }
  }
  return result;
}
