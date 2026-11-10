// Botcoin is fictional and local: a deterministic price driven by the office's real work, no network.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithOxc } from 'vite';
const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const source = await transformWithOxc(await read('src/leisure/botcoin.ts'), 'botcoin.ts');
const load = () => import('data:text/javascript;base64,' + Buffer.from(source.code + `\n// ${Math.random()}`).toString('base64'));
const a = await load(), b = await load();

const now = Date.parse('2026-11-10T15:00:00Z'), H = 3600000, D = 24 * H;
// Same moment, same price, in every module instance (every robot screen).
assert.equal(a.botcoinPrice(now), b.botcoinPrice(now), 'the price is a pure function of time and activity');
const quiet = a.botcoinPrice(now);
assert.ok(quiet > 900 && quiet < 1150, `a quiet office stays near its base price (${quiet})`);
// Small noise between neighbouring moments, not jumps.
assert.ok(Math.abs(a.botcoinPrice(now + 250) / quiet - 1) < 0.002, 'consecutive ticks move a little');

// Shipped work and earned coins push it up after they happen, never before.
const threads = Array.from({ length: 12 }, (_, i) => ({ settled: true, runStatus: 'completed', updatedAt: new Date(now - 6 * H + i * 60000).toISOString() }));
threads.push({ settled: false, runStatus: 'running', updatedAt: new Date(now - 5 * H).toISOString() });
a.observeOfficeActivity(threads, { '2026-11-09': 25, 'work:collected': 999, 'bonus:x': 50 });
assert.equal(a.botcoinPrice(now - 2 * D), b.botcoinPrice(now - 2 * D), 'work does not change earlier prices');
const busy = a.botcoinPrice(now);
const lift = Math.log(busy / quiet);
assert.ok(lift > 0.05 && lift < 0.08, `twelve sessions and a day of coins lift the price a few percent (${(lift * 100).toFixed(2)}%)`);
// Unfinished sessions and non-day ledger keys are ignored.
a.observeOfficeActivity(threads.slice(12), { 'work:collected': 999 });
assert.equal(a.botcoinPrice(now), quiet, 'running sessions and ledger totals do not move the price');
// Old work fades slowly, so quiet days look sideways rather than crashing.
a.observeOfficeActivity(threads.slice(0, 12));
const later = Math.log(a.botcoinPrice(now + D) / b.botcoinPrice(now + D));
assert.ok(later > 0.04 && later < 0.048, `a quiet day keeps most of the lift (${(later * 100).toFixed(2)}%)`);

// Candles line up with the clock, end at the open candle and agree with the price.
const candles = a.botcoinCandles('5m', 80, now + 90000);
assert.equal(candles.length, 80);
assert.equal(candles.at(-1).t, now, 'the newest candle opens on its 5 minute boundary');
assert.equal(candles[1].t - candles[0].t, 300000);
assert.equal(candles.at(-1).c, a.botcoinPrice(now + 90000), 'the open candle closes at the current price');
for (const c of candles) assert.ok(c.h >= Math.max(c.o, c.c) && c.l <= Math.min(c.o, c.c), 'wicks contain the bodies');
assert.deepEqual(a.botcoinCandles('1h', 10, now), a.botcoinCandles('1h', 10, now), 'charts are reproducible');

// Nothing about Botcoin reaches the network.
const trading = await read('src/leisure/trading.ts');
for (const text of [await read('src/leisure/botcoin.ts'), trading, await read('electron/preload.cjs')]) {
  assert.doesNotMatch(text, /fetch\(|binance|coingecko|market:klines|market:price|lucidMarket/i, 'no market feed remains');
}
assert.match(trading, /from "\.\/botcoin"/, 'the exchange draws Botcoin from the local simulation');
console.log('PASS: Botcoin is deterministic, local, rises with shipped work and coins, and drifts on quiet days.');
