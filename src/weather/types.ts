// The weather report that electron/weather.cjs produces and the renderer consumes.

export type WeatherKind = "clear" | "clouds" | "rain" | "drizzle" | "snow" | "storm" | "fog";

export type Weather = {
  kind: WeatherKind;
  tempC: number;
  windKmh: number;
  isDay: boolean;
  sunrise: string | null; // ISO time (UTC)
  sunset: string | null;  // ISO time (UTC)
  place: string;
  observedAt: string;     // ISO time (UTC)
  // extras, present when the API returned them
  windDir?: number;       // degrees the wind comes FROM (meteorological), 0 = north
  cloudCover?: number;    // 0 to 100
  code?: number;          // raw WMO weather code
  lat?: number;
  lon?: number;
  stale?: boolean;        // an older cached report returned because the latest fetch failed
  error?: string;         // why it is stale
};

export type Season = "spring" | "summer" | "autumn" | "winter";
