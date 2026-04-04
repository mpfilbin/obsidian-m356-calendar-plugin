import { M365Calendar, M365Event, NewEventInput } from '../types';
import { AuthService } from './AuthService';
import { CacheService } from './CacheService';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

export class CalendarService {
  constructor(
    private readonly auth: AuthService,
    private readonly cache: CacheService,
  ) {}

  async getCalendars(): Promise<M365Calendar[]> {
    const token = await this.auth.getValidToken();
    const response = await fetch(`${GRAPH_BASE}/me/calendars`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Failed to fetch calendars: ${response.statusText}`);
    const data = await response.json();
    return data.value.map((c: Record<string, unknown>) => ({
      id: c.id,
      name: c.name,
      color: (c.hexColor as string) || (c.color as string) || '#0078d4',
      isDefaultCalendar: (c.isDefaultCalendar as boolean) ?? false,
      canEdit: (c.canEdit as boolean) ?? false,
    }));
  }

  async getEvents(calendarIds: string[], start: Date, end: Date): Promise<M365Event[]> {
    const results = await Promise.all(
      calendarIds.map((id) => this.getEventsForCalendar(id, start, end)),
    );
    return results.flat();
  }

  async createEvent(calendarId: string, input: NewEventInput): Promise<M365Event> {
    const token = await this.auth.getValidToken();
    const body = {
      subject: input.subject,
      body: { contentType: 'text', content: input.description ?? '' },
      start: { dateTime: input.start.toISOString(), timeZone: 'UTC' },
      end: { dateTime: input.end.toISOString(), timeZone: 'UTC' },
      isAllDay: input.isAllDay ?? false,
    };
    const response = await fetch(`${GRAPH_BASE}/me/calendars/${calendarId}/events`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Failed to create event: ${response.statusText}`);
    const data = await response.json();
    return this.mapEvent(data, calendarId);
  }

  private async getEventsForCalendar(
    calendarId: string,
    start: Date,
    end: Date,
  ): Promise<M365Event[]> {
    const cacheKey = `${calendarId}:${start.toISOString()}:${end.toISOString()}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached.events;

    const token = await this.auth.getValidToken();
    const params = new URLSearchParams({
      startDateTime: start.toISOString(),
      endDateTime: end.toISOString(),
      $select: 'id,subject,start,end,isAllDay,bodyPreview,webLink',
    });
    const response = await fetch(
      `${GRAPH_BASE}/me/calendars/${calendarId}/calendarView?${params}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!response.ok) throw new Error(`Failed to fetch events: ${response.statusText}`);
    const data = await response.json();
    const events = data.value.map((e: Record<string, unknown>) =>
      this.mapEvent(e, calendarId),
    );
    await this.cache.set(cacheKey, events);
    return events;
  }

  private mapEvent(e: Record<string, unknown>, calendarId: string): M365Event {
    return {
      id: e.id as string,
      subject: e.subject as string,
      start: e.start as { dateTime: string; timeZone: string },
      end: e.end as { dateTime: string; timeZone: string },
      calendarId,
      isAllDay: (e.isAllDay as boolean) ?? false,
      bodyPreview: e.bodyPreview as string | undefined,
      webLink: e.webLink as string | undefined,
    };
  }
}
