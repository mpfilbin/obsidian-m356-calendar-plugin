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

export interface CachedEvents {
  events: M365Event[];
  fetchedAt: number;
}

export interface CacheStore {
  [key: string]: CachedEvents;
}

export interface M365CalendarSettings {
  clientId: string;
  tenantId: string;
  enabledCalendarIds: string[];
  defaultCalendarId: string;
  refreshIntervalMinutes: number;
  defaultView: 'month' | 'week' | 'day';
}

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}
