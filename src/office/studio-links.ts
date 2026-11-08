/** Map only an explicitly registered Ares project server to its Spacestation preview. */
export function studioLink(value: string, liveUrl: string | null, registered: string[]): string | null {
  let url: URL; try { url = new URL(value); } catch { return value; }
  if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return value;
  if (liveUrl && url.origin === new URL(liveUrl).origin) return value;
  const known = registered.some(origin => { try { const source = new URL(origin); return source.port === url.port && source.protocol === url.protocol; } catch { return false; } });
  return known && liveUrl ? new URL(url.pathname + url.search + url.hash, liveUrl).href : null;
}
