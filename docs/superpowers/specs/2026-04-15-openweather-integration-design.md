# OpenWeather Integration Design

**Date:** 2026-04-15
**Branch:** feat/openweather_integration

## Overview

Add optional weather information to the month, week, and day calendar views using the OpenWeather One Call API 3.0. Weather is disabled by default and requires the user to supply an API key and location in settings. When enabled, each view displays daily weather conditions using OpenWeather's CDN icon images; the day view additionally shows current temperature, high, low, and precipitation probability.

## Goals

- Display weather conditions in month, week, and day views when enabled
- Cache weather data to minimize API calls, with appropriate TTLs for forecast vs. historical data
- Handle rate limiting and API errors gracefully — weather failures degrade silently to a `?` placeholder without disrupting the calendar
- Mirror the existing service/cache architecture for consistency

## Non-Goals

- Push notifications or weather alerts
- Hourly weather breakdowns (daily granularity only)
- Custom icon sets (OpenWeather CDN icons only)

---

## Section 1: Data Layer

### New Types (`src/types/index.ts`)

```typescript
export interface WeatherCondition {
  code: number;          // OpenWeather condition code
  description: string;   // e.g. "light rain"
  iconCode: string;      // e.g. "10d" — used to build CDN icon URL
}

export interface DailyWeather {
  date: string;                // "YYYY-MM-DD" in local time
  condition: WeatherCondition;
  tempCurrent: number | null;  // null for past/future days without a current reading
  tempHigh: number | null;     // null when unavailable
  tempLow: number | null;      // null when unavailable
  precipProbability: number | null; // 0–1; null when unavailable
}

export interface WeatherCacheEntry {
  data: DailyWeather;
  fetchedAt: number;
}

export type WeatherCacheStore = Record<string, WeatherCacheEntry>; // key: "YYYY-MM-DD:location:units"
```

### Settings additions (`M365CalendarSettings`)

```typescript
weatherEnabled: boolean;         // default: false
openWeatherApiKey: string;       // default: ''
weatherLocation: string;         // e.g. "New York, US"
weatherUnits: 'imperial' | 'metric'; // default: 'imperial'
```

### `WeatherCacheService` (`src/services/WeatherCacheService.ts`)

Cache keyed by `"YYYY-MM-DD:location:units"`. Stored under `weatherCache` in Obsidian's `saveData` — fully isolated from the calendar `cache` key, so `CacheService.clearAll()` does not affect weather data.

**TTL rules:**
- Dates within the 8-day forecast window: **1 hour** (conditions may change)
- Historical dates: **24 hours** (data is stable)

**Interface:**
- `get(date: string, location: string, units: 'imperial' | 'metric'): DailyWeather | null` — returns the cached `DailyWeather` if the entry exists and is within TTL; returns `null` on cache miss (not present or expired). A `null` return means "go fetch" — it does not mean data is unavailable.
- `set(date: string, location: string, data: DailyWeather, units: 'imperial' | 'metric'): Promise<void>` — writes entry with `fetchedAt: Date.now()`
- `init(): Promise<void>` — loads persisted store, purges expired entries and persists if expired entries were removed
- `purgeExpired(): void` — removes stale entries per TTL rules above

### `WeatherService` (`src/services/WeatherService.ts`)

Fetches daily weather for a set of dates using One Call API 3.0.

**Endpoint selection:**
- Dates within today + 8 days: `/data/3.0/onecall` with `exclude=current,minutely,hourly,alerts`, reads `daily[]`
- Historical dates: `/data/3.0/onecall/timemachine` (returns hourly data for a past timestamp; temperature pulled from the closest hourly reading)

**Request handling:**
- Checks `WeatherCacheService` before fetching; writes to cache on miss
- `Semaphore(2)` limits concurrent in-flight requests to the OpenWeather API
- `fetchWithRetry`: reads `Retry-After` on 429, waits that duration, retries up to 3 times; throws on exhaustion
- Returns `null` for a given date on any error (network, 4xx, exhaustion)

**Primary method:**
```typescript
getWeatherForDates(dates: string[]): Promise<Map<string, DailyWeather | null>>
```
Returns a map of `"YYYY-MM-DD"` → `DailyWeather | null`. `null` means data was attempted but unavailable.

The service reads `apiKey`, `location`, and `units` from getter functions passed at construction time (same pattern as `AuthService`) so settings changes take effect immediately.

---

## Section 2: Settings & Wiring

### Settings Tab (`src/settings.ts`)

New **"Weather"** heading section added below the Calendar section:

| Control | Type | Default |
|---|---|---|
| Show weather | Toggle | Off |
| OpenWeather API key | Password text input | '' |
| Location | Text input (e.g. "New York, US") | '' |
| Temperature units | Dropdown: Fahrenheit / Celsius | Fahrenheit |

All controls follow the existing `Setting` + `onChange → saveSettings` pattern.

### `DEFAULT_SETTINGS` additions

```typescript
weatherEnabled: false,
openWeatherApiKey: '',
weatherLocation: '',
weatherUnits: 'imperial',
```

### `main.ts` Wiring

```typescript
this.weatherCacheService = new WeatherCacheService(
  async () => { const d = await this.loadData(); return (d?.weatherCache as WeatherCacheStore) ?? {}; },
  async (cache) => this.queueSave({ weatherCache: cache }),
);
await this.weatherCacheService.init();

this.weatherService = new WeatherService(
  () => this.settings.openWeatherApiKey,
  () => this.settings.weatherLocation,
  () => this.settings.weatherUnits,
  this.weatherCacheService,
);
```

`queueSave` serializes `saveData` read/merge/write operations so concurrent writes from settings, calendar cache, and weather cache cannot clobber each other.

`weatherService` is passed into the view context alongside `calendarService`.

### `AppContext` (`src/context.ts`)

`AppContextValue` gains:
```typescript
weatherService: WeatherService;
```

---

## Section 3: Data Fetching in `CalendarApp`

### State

```typescript
const [weather, setWeather] = useState<Map<string, DailyWeather | null>>(new Map());
```

Key: `"YYYY-MM-DD"`. Value: `DailyWeather` on success, `null` on attempted-but-unavailable (distinct from `WeatherCacheService.get` which uses `null` for cache miss), absent key means not yet fetched or weather disabled.

### `fetchWeather` callback

- Runs when `currentDate`, `view`, `settings.weatherEnabled`, `settings.weatherLocation`, `settings.openWeatherApiKey`, or `settings.weatherUnits` changes (via `useEffect`)
- Computes the set of visible dates for the current view
- If `weatherEnabled` is false, clears `weather` and returns
- Calls `weatherService.getWeatherForDates(dates)`
- Updates `weather` state with the result
- On error: sets all dates to `null` (silent — no `Notice` toast, no error state)

Weather is also refetched on the same background interval as calendar data.

### Props

`weather` is passed as a prop to `MonthView`, `WeekView`, and `DayView`:
```typescript
weather?: Map<string, DailyWeather | null>
```

---

## Section 4: UI Changes

### Icon rendering

OpenWeather CDN URL pattern: `https://openweathermap.org/img/wn/{iconCode}.png`

Three render states for all views:
- `weather` prop absent or key absent → render nothing
- Key present, value is `null` → render `?` placeholder
- Key present, value is `DailyWeather` → render `<img src={iconUrl} alt={condition.description} />`

### Month View (`src/components/MonthView.tsx`)

A small weather icon is absolutely positioned in the upper-right corner of each day cell. It sits on top of existing content via CSS (`position: absolute; top: 4px; right: 4px`) and does not affect event card layout. Icon size: 24×24px.

### Week View (`src/components/WeekView.tsx`)

A weather strip appears in each day column header below the day number, between the header row and the all-day events row. It mirrors the day view banner content in a compact stacked layout:

```
[icon]
72°F  H: 78°F  L: 61°F  ☂ 20%
```

- Icon: 24×24px OpenWeather CDN image (or `?` on null)
- Current temp: `tempCurrent` formatted with unit suffix, or `—` if `null`
- High/Low: always present when `DailyWeather` is available
- Precipitation: `precipProbability * 100` rounded to nearest integer, shown as `☂ N%`
- If weather is `null`: shows `?` placeholder
- If weather disabled: strip is not rendered

No layout disruption to the timeline below.

### Day View (`src/components/DayView.tsx`)

A weather banner row is inserted between the all-day events section and the `<TimelineColumn>`. It is outside the scrollable timeline area. Layout:

```
[icon]  72°F  H: 78°F  L: 61°F  ☂ 20%
```

- Icon: 32×32px OpenWeather CDN image (or `?` on null)
- Current temp: `tempCurrent` formatted with unit suffix, or `—` if `null`
- High/Low: always present when `DailyWeather` is available
- Precipitation: `precipProbability * 100` rounded to nearest integer, shown as `☂ N%`
- If weather is `null`: row shows `?` and a short "Weather data unavailable" label
- If weather disabled: row is not rendered

---

## Section 5: Testing & Error Handling

### Test Files

| File | Coverage |
|---|---|
| `tests/services/WeatherCacheService.test.ts` | Cache hit/miss, TTL enforcement (1h forecast vs 24h historical), purge-on-init, persistence via save/load stubs |
| `tests/services/WeatherService.test.ts` | Fetch on cache miss, cache hit skips fetch, 429 retry with `Retry-After`, returns `null` on error or missing API key, correct endpoint for forecast vs historical |
| `tests/components/CalendarApp.test.tsx` | `getWeatherForDates` called when `weatherEnabled: true`; not called when `weatherEnabled: false` |

### Error Handling

| Scenario | Behavior |
|---|---|
| Missing API key or location | `WeatherService` returns `null` for all dates; views show `?` |
| 401 / 403 (bad/expired key) | Returns `null` silently |
| 429 Too Many Requests | Retry up to 3× with `Retry-After` backoff; return `null` on exhaustion |
| Network error | Returns `null` for that date |
| `null` data in view | Icon placeholder `?` rendered; no error surfaced to user |

Weather failures never surface as `Notice` toasts or error banners. They degrade gracefully to `?` placeholders while leaving all calendar functionality intact.

---

## Files Affected

| File | Change |
|---|---|
| `src/types/index.ts` | Add `WeatherCondition`, `DailyWeather`, `WeatherCacheEntry`, `WeatherCacheStore`; extend `M365CalendarSettings` |
| `src/services/WeatherCacheService.ts` | New — weather-specific cache with dual TTL |
| `src/services/WeatherService.ts` | New — OpenWeather One Call API 3.0 client |
| `src/context.ts` | Add `weatherService` to `AppContextValue` |
| `src/main.ts` | Construct and wire `WeatherCacheService` and `WeatherService` |
| `src/settings.ts` | Add Weather settings section; extend `DEFAULT_SETTINGS` |
| `src/components/CalendarApp.tsx` | Add `weather` state, `fetchWeather` callback, pass `weather` prop to views |
| `src/components/MonthView.tsx` | Accept `weather` prop; render icon in day cell upper-right |
| `src/components/WeekView.tsx` | Accept `weather` prop; render icon in column header |
| `src/components/DayView.tsx` | Accept `weather` prop; render weather banner above timeline |
| `tests/services/WeatherCacheService.test.ts` | New |
| `tests/services/WeatherService.test.ts` | New |
| `tests/components/CalendarApp.test.tsx` | Add weather fetch tests |
