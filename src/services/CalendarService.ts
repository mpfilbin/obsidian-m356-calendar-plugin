import { M365Calendar, M365Event, NewEventInput, EventPatch } from '../types';
import { AuthService } from './AuthService';
import { CacheService } from './CacheService';
import { toLocalISOString } from '../lib/datetime';

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
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const isAllDay = input.isAllDay ?? false;
    const formatDateTime = (d: Date) =>
      isAllDay ? `${d.toISOString().slice(0, 10)}T00:00:00` : toLocalISOString(d);
    const body = {
      subject: input.subject,
      body: { contentType: 'text', content: input.description ?? '' },
      start: { dateTime: formatDateTime(input.start), timeZone },
      end: { dateTime: formatDateTime(input.end), timeZone },
      isAllDay,
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
    this.cache.clearAll();
    return this.mapEvent(data, calendarId);
  }

  async updateEvent(eventId: string, patch: EventPatch): Promise<void> {
    const token = await this.auth.getValidToken();
    const body: Record<string, unknown> = {};
    if (patch.subject !== undefined) body.subject = patch.subject;
    if (patch.location !== undefined) body.location = { displayName: patch.location };
    if (patch.isAllDay !== undefined) body.isAllDay = patch.isAllDay;
    if (patch.start !== undefined) body.start = patch.start;
    if (patch.end !== undefined) body.end = patch.end;
    if (patch.bodyContent !== undefined) body.body = { contentType: 'text', content: patch.bodyContent };
    const response = await fetch(`${GRAPH_BASE}/me/events/${eventId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Failed to update event: ${response.statusText}`);
    this.cache.clearAll();
  }

  async deleteEvent(eventId: string): Promise<void> {
    const token = await this.auth.getValidToken();
    const response = await fetch(`${GRAPH_BASE}/me/events/${eventId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Failed to delete event: ${response.statusText}`);
    this.cache.clearAll();
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
      $select: 'id,subject,start,end,isAllDay,bodyPreview,webLink,location',
      $top: '999',
    });
    const events: M365Event[] = [];
    let url: string | null = `${GRAPH_BASE}/me/calendars/${calendarId}/calendarView?${params}`;
    while (url) {
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error(`Failed to fetch events: ${response.statusText}`);
      const data = await response.json() as Record<string, unknown>;
      (data.value as Record<string, unknown>[]).forEach((e) => events.push(this.mapEvent(e, calendarId)));
      url = (data['@odata.nextLink'] as string | undefined) ?? null;
    }
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
      location: (e.location as { displayName?: string } | undefined)?.displayName,
    };
  }
}
