import type { Weather } from '../weather/types';

/** One local sky for every building, using the reported sun times when current. */
export function campusNight(now: Date, weather: Weather | null): number {
  const time = now.getTime(), rise = Date.parse(weather?.sunrise || ''), set = Date.parse(weather?.sunset || '');
  const sameDay = (t: number) => Number.isFinite(t) && new Date(t).toDateString() === now.toDateString();
  const twilight = 40 * 60000;
  if (sameDay(rise) && sameDay(set) && rise < set) {
    if (time < rise) return Math.min(.82, .82 * (rise - time) / twilight);
    if (time > set) return Math.min(.82, .82 * (time - set) / twilight);
    return 0;
  }
  const observed = Date.parse(weather?.observedAt || '');
  if (weather && !weather.stale && Math.abs(time - observed) < 90 * 60000) return weather.isDay ? 0 : .82;
  // Weather may be offline. Local clock and season still give an honest night.
  const h = now.getHours() + now.getMinutes() / 60, month = now.getMonth();
  const summer = month >= 3 && month <= 8, dawn = summer ? 6 : 8, dusk = summer ? 20 : 16.5;
  return Math.max(0, Math.min(.82, Math.max(dawn - h, h - dusk) * .82));
}
