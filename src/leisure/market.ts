// Live BTC/USD market data for Botcoin from the main process (cached and rate limited there, see electron/market.cjs).
// Resolves null when there is no data (offline, blocked, or running outside the app).
export type RealCandle = { t: number; o: number; h: number; l: number; c: number };
type Answer<T> = { ok: boolean; value?: T; error?: string };
type Api = {
  klines(symbol: string, interval: string): Promise<Answer<{ source: string; candles: RealCandle[] }>>;
  price(symbol: string): Promise<Answer<{ source: string; price: number }>>;
};
const api = () => (window as unknown as { lucidMarket?: Api }).lucidMarket;

export const INTERVALS = ["1m", "5m", "15m", "1h"] as const;
export type Interval = (typeof INTERVALS)[number];
export const INTERVAL_MS: Record<Interval, number> = { "1m": 60000, "5m": 300000, "15m": 900000, "1h": 3600000 };

export async function realKlines(interval: Interval): Promise<{ source: string; candles: RealCandle[] } | null> {
  try {
    const r = await api()?.klines("BTCUSDT", interval);
    return r?.ok && r.value && r.value.candles.length > 10 ? r.value : null;
  } catch { return null; }
}

export async function realPrice(): Promise<{ source: string; price: number } | null> {
  try {
    const r = await api()?.price("BTCUSDT");
    return r?.ok && r.value && Number.isFinite(r.value.price) ? r.value : null;
  } catch { return null; }
}
