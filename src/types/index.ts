export interface M365Calendar {
  id: string;
  name: string;
  color: string;
  isDefaultCalendar: boolean;
  canEdit: boolean;
}

export interface M365Event {
  id: string;
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  calendarId: string;
  isAllDay: boolean;
  bodyPreview?: string;
  webLink?: string;
  location?: string;
}

export interface NewEventInput {
  subject: string;
  start: Date;
  end: Date;
  description?: string;
  isAllDay?: boolean;
}

export interface EventPatch {
  subject?: string;
  location?: string;
  isAllDay?: boolean;
  start?: { dateTime: string; timeZone: string };
  end?: { dateTime: string; timeZone: string };
  bodyContent?: string;
}

export interface CalendarCacheEntry {
  events: M365Event[];
  intervals: Array<{ start: string; end: string; fetchedAt: number }>;
}

export type CacheStore = Record<string, CalendarCacheEntry>;

export interface M365CalendarSettings {
  clientId: string;
  tenantId: string;
  enabledCalendarIds: string[];
  defaultCalendarId: string;
  refreshIntervalMinutes: number;
  defaultView: 'month' | 'week' | 'day';
  weatherEnabled: boolean;
  openWeatherApiKey: string;
  weatherLocation: string;
  weatherUnits: 'imperial' | 'metric';
}

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface WeatherCondition {
  code: number;          // OpenWeather condition code e.g. 800
  description: string;   // e.g. "clear sky"
  iconCode: string;      // e.g. "01d" — appended to CDN icon URL
}

export interface DailyWeather {
  date: string;                   // "YYYY-MM-DD" in local time
  condition: WeatherCondition;
  tempCurrent: number | null;     // representative temp at the requested time; null if the API omits it
  tempHigh: number | null;        // null for historical dates (timemachine doesn't return daily min/max)
  tempLow: number | null;         // null for historical dates
  precipProbability: number | null; // 0–1; null for historical dates
}

export interface WeatherCacheEntry {
  data: DailyWeather;
  fetchedAt: number;
}

export type WeatherCacheStore = Record<string, WeatherCacheEntry>; // key: "YYYY-MM-DD:location"
