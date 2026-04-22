import { M365Calendar, M365Event, NewEventInput, EventPatch } from '../types';
import { AuthService } from './AuthService';
import { CacheService } from './CacheService';
import { Semaphore } from '../lib/semaphore';
import { toLocalISOString } from '../lib/datetime';
import { fetchWithRetry } from '../lib/fetchWithRetry';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

export class CalendarService {
  private readonly semaphore = new Semaphore(2);

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
      color: (c.hexColor as string) || '#0078d4',
      isDefaultCalendar: (c.isDefaultCalendar as boolean) ?? false,
      canEdit: (c.canEdit as boolean) ?? false,
    }));
  }

  async getEvents(calendarIds: string[], start: Date, end: Date, bypassCache = false): Promise<M365Event[]> {
    const results = await Promise.all(
      calendarIds.map((id) => this.getEventsForCalendar(id, start, end, bypassCache)),
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
    await this.cache.clearAll();
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
    await this.cache.clearAll();
  }

  async deleteEvent(eventId: string): Promise<void> {
    const token = await this.auth.getValidToken();
    const response = await fetch(`${GRAPH_BASE}/me/events/${eventId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Failed to delete event: ${response.statusText}`);
    await this.cache.clearAll();
  }

  async moveEvent(event: M365Event, destinationCalendarId: string, patch: EventPatch): Promise<void> {
    // The Graph API has no move endpoint for calendar events (only for mail).
    // Create in the destination calendar first (so the original is preserved if
    // creation fails), then delete the original.
    const isAllDay = patch.isAllDay ?? event.isAllDay;
    // patch datetime strings are local-format ("YYYY-MM-DDTHH:MM:SS"); new Date()
    // without a timezone offset treats them as local time, which is correct here.
    const startDate = new Date(patch.start?.dateTime ?? event.start.dateTime);
    const endDate = new Date(patch.end?.dateTime ?? event.end.dateTime);
    await this.createEvent(destinationCalendarId, {
      subject: patch.subject ?? event.subject,
      start: startDate,
      end: endDate,
      isAllDay,
      description: patch.bodyContent ?? event.bodyPreview,
    });
    await this.deleteEvent(event.id);
  }

  private async getEventsForCalendar(
    calendarId: string,
    start: Date,
    end: Date,
    bypassCache = false,
  ): Promise<M365Event[]> {
    const cached = bypassCache ? null : this.cache.getEventsForRange(calendarId, start, end);
    if (cached !== null) return cached;

    await this.semaphore.acquire();
    try {
      const token = await this.auth.getValidToken();
      const params = new URLSearchParams({
        startDateTime: start.toISOString(),
        endDateTime: end.toISOString(),
        $select: 'id,subject,start,end,isAllDay,bodyPreview,webLink,location',
        $top: '999',
      });
      const events: M365Event[] = [];
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      let url: string | null = `${GRAPH_BASE}/me/calendars/${calendarId}/calendarView?${params}`;
      while (url) {
        const response = await fetchWithRetry(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Prefer: `outlook.timezone="${timeZone}"`,
          },
        });
        if (!response.ok) throw new Error(`Failed to fetch events: ${response.statusText}`);
        const data = await response.json() as Record<string, unknown>;
        (data.value as Record<string, unknown>[]).forEach((e) => events.push(this.mapEvent(e, calendarId)));
        url = (data['@odata.nextLink'] as string | undefined) ?? null;
      }
      await this.cache.addEvents(calendarId, start, end, events);
      return events;
    } finally {
      this.semaphore.release();
    }
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
