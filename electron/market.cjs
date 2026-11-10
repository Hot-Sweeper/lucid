// Public market data behind the robots' fictional Botcoin Exchange: real BTC/USD candles and the last
// price. The app only labels them "Live market feed", never with an exchange or coin name.
// Binance's public market data first (no key), CoinGecko as the fallback. Everything is cached
// and spaced out, so ten robots watching the same chart cost the same as one: the renderer asks
// as often as it likes, the network only sees a few requests a minute.

const HOSTS = ["https://data-api.binance.vision", "https://api.binance.com"];
const INTERVAL = { "1m": { ttl: 15000, ms: 60000 }, "5m": { ttl: 30000, ms: 300000 }, "15m": { ttl: 60000, ms: 900000 }, "1h": { ttl: 120000, ms: 3600000 } };
const PRICE_TTL = 3500;
const MIN_GAP = 250;            // at least this long between two requests to the network
const TIMEOUT = 6000;
const BAD_FOR = 60000;          // after a failure, the same source is left alone for a minute

const cache = new Map();        // key -> { at, value }
const flying = new Map();       // key -> promise
const badUntil = new Map();     // source -> time
let chain = Promise.resolve();
let lastRequest = 0;

// One request at a time, spaced out.
function fetchJson(url) {
  const run = async () => {
    const wait = lastRequest + MIN_GAP - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequest = Date.now();
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), TIMEOUT);
    try {
      const res = await fetch(url, { signal: ctl.signal, headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally { clearTimeout(t); }
  };
  const p = chain.then(run, run);
  chain = p.catch(() => {});
  return p;
}

// Cached, and the same question asked twice at once is one request.
async function cached(key, ttl, load) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  if (flying.has(key)) return flying.get(key);
  const p = load().then((value) => { cache.set(key, { at: Date.now(), value }); return value; }).finally(() => flying.delete(key));
  flying.set(key, p);
  return p;
}

const usable = (source) => (badUntil.get(source) ?? 0) < Date.now();
const markBad = (source) => badUntil.set(source, Date.now() + BAD_FOR);

async function binance(path) {
  let last;
  for (const host of HOSTS) {
    if (!usable(host)) continue;
    try { return await fetchJson(host + path); } catch (e) { last = e; markBad(host); }
  }
  throw last ?? new Error("no market source reachable");
}

const num = (x) => Number(x);

async function klines(symbol, interval) {
  const cfg = INTERVAL[interval];
  if (!cfg || symbol !== "BTCUSDT") throw new Error("unsupported market");
  return cached(`k:${symbol}:${interval}`, cfg.ttl, async () => {
    try {
      const rows = await binance(`/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=90`);
      return { source: "Binance", symbol, interval, candles: rows.map((r) => ({ t: r[0], o: num(r[1]), h: num(r[2]), l: num(r[3]), c: num(r[4]) })) };
    } catch {
      // CoinGecko has no minute candles: bucket its price points into the interval, 5 minutes and up
      if (cfg.ms < 300000 || !usable("coingecko")) throw new Error("no candles for this timeframe");
      try {
        const j = await fetchJson("https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=1");
        const buckets = new Map();
        for (const [t, p] of j.prices) {
          const k = Math.floor(t / cfg.ms) * cfg.ms, b = buckets.get(k);
          if (!b) buckets.set(k, { t: k, o: p, h: p, l: p, c: p });
          else { b.h = Math.max(b.h, p); b.l = Math.min(b.l, p); b.c = p; }
        }
        const candles = [...buckets.values()].sort((a, b) => a.t - b.t).slice(-90);
        if (candles.length < 10) throw new Error("too little data");
        return { source: "CoinGecko", symbol, interval, candles };
      } catch (e) { markBad("coingecko"); throw e; }
    }
  });
}

async function price(symbol) {
  if (symbol !== "BTCUSDT") throw new Error("unsupported market");
  return cached(`p:${symbol}`, PRICE_TTL, async () => {
    try {
      const j = await binance(`/api/v3/ticker/price?symbol=${symbol}`);
      return { source: "Binance", price: num(j.price), at: Date.now() };
    } catch (e) {
      if (!usable("coingecko")) throw e;
      try {
        const j = await fetchJson("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd");
        return { source: "CoinGecko", price: num(j.bitcoin.usd), at: Date.now() };
      } catch (e2) { markBad("coingecko"); throw e2; }
    }
  });
}

// Handlers answer { ok, value } or { ok: false, error }, like the T3 ones.
function register(ipcMain) {
  const wrap = (fn) => async (_e, ...args) => {
    try { return { ok: true, value: await fn(...args) }; } catch (err) { return { ok: false, error: String(err?.message || err) }; }
  };
  ipcMain.handle("market:klines", wrap((symbol, interval) => klines(String(symbol), String(interval))));
  ipcMain.handle("market:price", wrap((symbol) => price(String(symbol))));
}

module.exports = { register };
