import { M365Calendar, M365Event, NewEventInput, EventPatch, EventRecurrence } from '../types';
import { AuthService } from './AuthService';
import { GraphClient } from './GraphClient';
import { type Logger, NullLogger } from '../lib/logger';
import { CacheService } from './CacheService';
import { Semaphore } from '../lib/semaphore';
import { toLocalISOString, toDateOnly } from '../lib/datetime';


export class CalendarService {
  private readonly semaphore = new Semaphore(2);
  private readonly graph: GraphClient;

  constructor(
    auth: AuthService,
    private readonly cache: CacheService,
    logger: Logger = new NullLogger(),
  ) {
    this.graph = new GraphClient(auth, logger);
  }

  async getCalendars(): Promise<M365Calendar[]> {
    const data = await this.graph.json<{ value: Record<string, unknown>[] }>('GET', '/me/calendars', 'fetch calendars');
    return data.value.map((c) => ({
      id: c.id as string,
      name: c.name as string,
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
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const isAllDay = input.isAllDay ?? false;
    const formatDateTime = (d: Date) =>
      isAllDay ? `${toDateOnly(d)}T00:00:00` : toLocalISOString(d);
    const body = {
      subject: input.subject,
      body: { contentType: 'text', content: input.description ?? '' },
      ...(input.location ? { location: { displayName: input.location } } : {}),
      start: { dateTime: formatDateTime(input.start), timeZone },
      end: { dateTime: formatDateTime(input.end), timeZone },
      isAllDay,
      ...(input.recurrence ? { recurrence: this.buildRecurrenceBody(input.recurrence, input.start) } : {}),
    };
    const data = await this.graph.json<Record<string, unknown>>(
      'POST', `/me/calendars/${calendarId}/events`, 'create event', { body },
    );
    await this.cache.clearAll();
    return this.mapEvent(data, calendarId);
  }

  async updateEvent(eventId: string, patch: EventPatch): Promise<void> {
    const body: Record<string, unknown> = {};
    if (patch.subject !== undefined) body.subject = patch.subject;
    if (patch.location !== undefined) body.location = { displayName: patch.location };
    if (patch.isAllDay !== undefined) body.isAllDay = patch.isAllDay;
    if (patch.start !== undefined) body.start = patch.start;
    if (patch.end !== undefined) body.end = patch.end;
    if (patch.bodyContent !== undefined) body.body = { contentType: 'text', content: patch.bodyContent };
    await this.graph.send('PATCH', `/me/events/${eventId}`, 'update event', { body });
    await this.cache.clearAll();
  }

  async deleteEvent(eventId: string): Promise<void> {
    await this.graph.send('DELETE', `/me/events/${eventId}`, 'delete event');
    await this.cache.clearAll();
  }

  async deleteEventSeries(seriesMasterId: string): Promise<void> {
    await this.graph.send('DELETE', `/me/events/${seriesMasterId}`, 'delete event series');
    await this.cache.clearAll();
  }

  async moveEvent(event: M365Event, destinationCalendarId: string, patch: EventPatch): Promise<void> {
    // The Graph API has no move endpoint for calendar events (only for mail).
    // Create in the destination calendar first (so the original is preserved if
    // creation fails), then delete the original.
    // Recurring events cannot be copied faithfully (recurrence, exceptions), so
    // refuse rather than silently turning a series into a single event.
    if (event.type && event.type !== 'singleInstance') {
      throw new Error('Recurring events cannot be moved to another calendar');
    }
    const isAllDay = patch.isAllDay ?? event.isAllDay;
    // patch datetime strings are local-format ("YYYY-MM-DDTHH:MM:SS"); new Date()
    // without a timezone offset treats them as local time, which is correct here.
    const startDate = new Date(patch.start?.dateTime ?? event.start.dateTime);
    const endDate = new Date(patch.end?.dateTime ?? event.end.dateTime);
    // bodyPreview is truncated, so fetch the full body when the patch doesn't supply one.
    const description = patch.bodyContent ?? (await this.getEventBody(event.id)) ?? event.bodyPreview;
    await this.createEvent(destinationCalendarId, {
      subject: patch.subject ?? event.subject,
      start: startDate,
      end: endDate,
      isAllDay,
      description,
      location: patch.location ?? event.location,
    });
    await this.deleteEvent(event.id);
  }

  private async getEventBody(eventId: string): Promise<string | undefined> {
    const data = await this.graph.json<{ body?: { content?: string } }>(
      'GET', `/me/events/${eventId}?$select=body`, 'fetch event',
      { headers: { Prefer: 'outlook.body-content-type="text"' } },
    );
    return data.body?.content;
  }

  private buildRecurrenceBody(r: EventRecurrence, start: Date): object {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const pattern: Record<string, unknown> = { type: r.frequency, interval: r.interval };
    if (r.frequency === 'weekly') {
      pattern.daysOfWeek = r.daysOfWeek;
    } else if (r.frequency === 'absoluteMonthly') {
      pattern.dayOfMonth = start.getDate();
    } else if (r.frequency === 'relativeMonthly') {
      pattern.daysOfWeek = r.daysOfWeek;
      pattern.index = r.weekIndex;
    } else if (r.frequency === 'absoluteYearly') {
      pattern.dayOfMonth = start.getDate();
      pattern.month = start.getMonth() + 1;
    }
    const range: Record<string, unknown> = {
      type: r.end.type,
      startDate: toDateOnly(start),
      recurrenceTimeZone: timeZone,
    };
    if (r.end.type === 'endDate') range.endDate = r.end.endDate;
    if (r.end.type === 'numbered') range.numberOfOccurrences = r.end.numberOfOccurrences;
    return { pattern, range };
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
      const params = new URLSearchParams({
        startDateTime: start.toISOString(),
        endDateTime: end.toISOString(),
        $select: 'id,subject,start,end,isAllDay,bodyPreview,webLink,location,type,seriesMasterId',
        $top: '999',
      });
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const raw = await this.graph.getAll<Record<string, unknown>>(
        `/me/calendars/${calendarId}/calendarView?${params}`,
        'fetch events',
        { headers: { Prefer: `outlook.timezone="${timeZone}"` } },
      );
      const events = raw.map((e) => this.mapEvent(e, calendarId));
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
      type: e.type as M365Event['type'] | undefined,
      seriesMasterId: e.seriesMasterId as string | undefined,
    };
  }
}
