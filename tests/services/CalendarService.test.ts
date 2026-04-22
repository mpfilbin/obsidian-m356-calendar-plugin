import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CalendarService } from '../../src/services/CalendarService';
import { AuthService } from '../../src/services/AuthService';
import { CacheService } from '../../src/services/CacheService';
import { M365Event, EventPatch } from '../../src/types';

const FAKE_EVENT_RESPONSE = {
  id: 'evt1',
  subject: 'Team Standup',
  start: { dateTime: '2026-04-04T09:00:00', timeZone: 'UTC' },
  end: { dateTime: '2026-04-04T09:30:00', timeZone: 'UTC' },
  isAllDay: false,
  bodyPreview: '',
  webLink: 'https://outlook.office.com/calendar/item/evt1',
};

const EXPECTED_EVENT: M365Event = {
  id: 'evt1',
  subject: 'Team Standup',
  start: { dateTime: '2026-04-04T09:00:00', timeZone: 'UTC' },
  end: { dateTime: '2026-04-04T09:30:00', timeZone: 'UTC' },
  calendarId: 'cal1',
  isAllDay: false,
  bodyPreview: '',
  webLink: 'https://outlook.office.com/calendar/item/evt1',
};

describe('CalendarService', () => {
  let auth: Pick<AuthService, 'getValidToken'>;
  let cache: Pick<CacheService, 'getEventsForRange' | 'addEvents' | 'clearAll'>;
  let service: CalendarService;

  beforeEach(() => {
    auth = { getValidToken: vi.fn().mockResolvedValue('token') };
    cache = {
      getEventsForRange: vi.fn().mockReturnValue(null),
      addEvents: vi.fn().mockResolvedValue(undefined),
      clearAll: vi.fn(),
    };
    service = new CalendarService(auth as AuthService, cache as CacheService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('getCalendars maps Graph response correctly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        value: [{
          id: 'cal1',
          name: 'My Calendar',
          hexColor: '#0078d4',
          isDefaultCalendar: true,
          canEdit: true,
        }],
      }),
    }));
    const calendars = await service.getCalendars();
    expect(calendars).toHaveLength(1);
    expect(calendars[0]).toEqual({
      id: 'cal1',
      name: 'My Calendar',
      color: '#0078d4',
      isDefaultCalendar: true,
      canEdit: true,
    });
  });

  it('getCalendars throws when Graph returns error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      statusText: 'Unauthorized',
    }));
    await expect(service.getCalendars()).rejects.toThrow('Failed to fetch calendars: Unauthorized');
  });

  it('getEvents returns cached events when interval covers range', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    (cache.getEventsForRange as ReturnType<typeof vi.fn>).mockReturnValue([EXPECTED_EVENT]);
    const events = await service.getEvents(['cal1'], new Date('2026-04-01'), new Date('2026-04-30'));
    expect(events).toEqual([EXPECTED_EVENT]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('getEvents bypasses cache when bypassCache=true', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ value: [FAKE_EVENT_RESPONSE] }),
    });
    vi.stubGlobal('fetch', fetchSpy);
    (cache.getEventsForRange as ReturnType<typeof vi.fn>).mockReturnValue([EXPECTED_EVENT]);
    const events = await service.getEvents(['cal1'], new Date('2026-04-01'), new Date('2026-04-30'), true);
    expect(fetchSpy).toHaveBeenCalled(); // must fetch even though cache would hit
    expect(events[0].subject).toBe('Team Standup');
  });

  it('getEvents fetches from Graph on cache miss and calls addEvents', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ value: [FAKE_EVENT_RESPONSE] }),
    }));
    const events = await service.getEvents(['cal1'], new Date('2026-04-01'), new Date('2026-04-30'));
    expect(events[0].subject).toBe('Team Standup');
    expect(events[0].calendarId).toBe('cal1');
    expect(cache.addEvents).toHaveBeenCalled();
  });

  it('getEvents merges events from multiple calendars', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ value: [FAKE_EVENT_RESPONSE] }),
    }));
    const events = await service.getEvents(
      ['cal1', 'cal2'],
      new Date('2026-04-01'),
      new Date('2026-04-30'),
    );
    expect(events).toHaveLength(2);
  });

  it('getEvents maps location displayName from Graph response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        value: [{
          id: 'evt1',
          subject: 'Team Standup',
          start: { dateTime: '2026-04-04T09:00:00', timeZone: 'UTC' },
          end: { dateTime: '2026-04-04T09:30:00', timeZone: 'UTC' },
          isAllDay: false,
          bodyPreview: '',
          webLink: 'https://outlook.office.com/calendar/item/evt1',
          location: { displayName: 'Conference Room A' },
        }],
      }),
    }));
    const events = await service.getEvents(['cal1'], new Date('2026-04-01'), new Date('2026-04-30'));
    expect(events[0].location).toBe('Conference Room A');
  });

  it('getEvents sets location to undefined when Graph response has no location', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ value: [FAKE_EVENT_RESPONSE] }),
    }));
    const events = await service.getEvents(['cal1'], new Date('2026-04-01'), new Date('2026-04-30'));
    expect(events[0].location).toBeUndefined();
  });

  it('getEvents follows @odata.nextLink to collect all pages', async () => {
    const page2Event = { ...FAKE_EVENT_RESPONSE, id: 'evt2', subject: 'Second Event' };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          value: [FAKE_EVENT_RESPONSE],
          '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/calendars/cal1/calendarView?$skiptoken=abc',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ value: [page2Event] }),
      });
    vi.stubGlobal('fetch', fetchMock);
    const events = await service.getEvents(['cal1'], new Date('2026-04-01'), new Date('2026-05-01'));
    expect(events).toHaveLength(2);
    expect(events[0].id).toBe('evt1');
    expect(events[1].id).toBe('evt2');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://graph.microsoft.com/v1.0/me/calendars/cal1/calendarView?$skiptoken=abc',
    );
  });

  it('getEvents requests $top=999 to minimize pagination round-trips', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ value: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await service.getEvents(['cal1'], new Date('2026-04-01'), new Date('2026-05-01'));
    const url: string = fetchMock.mock.calls[0][0];
    expect(decodeURIComponent(url)).toContain('$top=999');
  });

  // --- 429 retry ---

  it('getEvents retries on 429 and succeeds after Retry-After delay', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: (h: string) => (h === 'Retry-After' ? '1' : null) },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ value: [FAKE_EVENT_RESPONSE] }),
      });
    vi.stubGlobal('fetch', fetchMock);
    const promise = service.getEvents(['cal1'], new Date('2026-04-01'), new Date('2026-05-01'));
    await vi.runAllTimersAsync();
    const events = await promise;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(events).toHaveLength(1);
  });

  it('getEvents throws after 3 failed 429 attempts', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: { get: (h: string) => (h === 'Retry-After' ? '1' : null) },
    });
    vi.stubGlobal('fetch', fetchMock);
    const promise = service.getEvents(['cal1'], new Date('2026-04-01'), new Date('2026-05-01'));
    const assertion = expect(promise).rejects.toThrow('Failed to fetch events: Too Many Requests');
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('getEvents falls back to 10s delay when Retry-After header is absent', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: () => null },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ value: [] }),
      });
    vi.stubGlobal('fetch', fetchMock);
    const promise = service.getEvents(['cal1'], new Date('2026-04-01'), new Date('2026-05-01'));
    await vi.runAllTimersAsync();
    await promise;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // --- createEvent / updateEvent / deleteEvent ---

  it('createEvent posts to Graph and returns mapped event', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        id: 'evt2',
        subject: 'New Event',
        start: { dateTime: '2026-04-05T10:00:00', timeZone: 'UTC' },
        end: { dateTime: '2026-04-05T11:00:00', timeZone: 'UTC' },
        isAllDay: false,
        bodyPreview: undefined,
        webLink: undefined,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const event = await service.createEvent('cal1', {
      subject: 'New Event',
      start: new Date('2026-04-05T10:00:00Z'),
      end: new Date('2026-04-05T11:00:00Z'),
    });
    expect(event.subject).toBe('New Event');
    expect(event.calendarId).toBe('cal1');
    expect(event.id).toBe('evt2');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.start.dateTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    expect(body.end.dateTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    expect(body.start.timeZone).toBeTruthy();
    expect(body.end.timeZone).toBeTruthy();
  });

  it('createEvent clears the cache on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        id: 'evt2',
        subject: 'New Event',
        start: { dateTime: '2026-04-05T10:00:00Z', timeZone: 'UTC' },
        end: { dateTime: '2026-04-05T11:00:00Z', timeZone: 'UTC' },
        isAllDay: false,
      }),
    }));
    await service.createEvent('cal1', {
      subject: 'New Event',
      start: new Date('2026-04-05T10:00:00Z'),
      end: new Date('2026-04-05T11:00:00Z'),
    });
    expect(cache.clearAll).toHaveBeenCalled();
  });

  it('createEvent sends midnight local-date format for all-day events', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        id: 'evt-allday',
        subject: 'All Day Event',
        start: { dateTime: '2026-04-10T00:00:00', timeZone: 'UTC' },
        end: { dateTime: '2026-04-11T00:00:00', timeZone: 'UTC' },
        isAllDay: true,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await service.createEvent('cal1', {
      subject: 'All Day Event',
      start: new Date('2026-04-10'),
      end: new Date('2026-04-11'),
      isAllDay: true,
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.start.dateTime).toBe('2026-04-10T00:00:00');
    expect(body.end.dateTime).toBe('2026-04-11T00:00:00');
    expect(body.isAllDay).toBe(true);
  });

  it('updateEvent sends PATCH to /me/events/{id} with correct body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await service.updateEvent('evt1', { subject: 'Updated', location: 'Room 42' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://graph.microsoft.com/v1.0/me/events/evt1',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({
          Authorization: 'Bearer token',
          'Content-Type': 'application/json',
        }),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.subject).toBe('Updated');
    expect(body.location).toEqual({ displayName: 'Room 42' });
  });

  it('updateEvent clears the cache on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    await service.updateEvent('evt1', { subject: 'Updated' });
    expect(cache.clearAll).toHaveBeenCalled();
  });

  it('updateEvent omits undefined fields from PATCH body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await service.updateEvent('evt1', { subject: 'Only Subject' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toEqual({ subject: 'Only Subject' });
    expect(body.location).toBeUndefined();
  });

  it('updateEvent throws when Graph returns error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, statusText: 'Forbidden' }));
    await expect(service.updateEvent('evt1', { subject: 'x' })).rejects.toThrow(
      'Failed to update event: Forbidden',
    );
  });

  it('deleteEvent sends DELETE to /me/events/{id} with correct auth header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await service.deleteEvent('evt1');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://graph.microsoft.com/v1.0/me/events/evt1',
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({ Authorization: 'Bearer token' }),
      }),
    );
  });

  it('deleteEvent clears the cache on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    await service.deleteEvent('evt1');
    expect(cache.clearAll).toHaveBeenCalled();
  });

  it('deleteEvent throws when Graph returns error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, statusText: 'Not Found' }));
    await expect(service.deleteEvent('evt1')).rejects.toThrow('Failed to delete event: Not Found');
  });

  // --- moveEvent ---

  const MOVE_EVENT: M365Event = { ...EXPECTED_EVENT };
  const MOVE_PATCH: EventPatch = {
    subject: 'Moved Meeting',
    start: { dateTime: '2026-04-04T09:00:00', timeZone: 'UTC' },
    end: { dateTime: '2026-04-04T09:30:00', timeZone: 'UTC' },
    isAllDay: false,
  };
  const MOVE_CREATE_RESPONSE = {
    id: 'evt-new',
    subject: 'Moved Meeting',
    start: { dateTime: '2026-04-04T09:00:00', timeZone: 'UTC' },
    end: { dateTime: '2026-04-04T09:30:00', timeZone: 'UTC' },
    isAllDay: false,
  };

  it('moveEvent creates in the destination calendar then deletes the original', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOVE_CREATE_RESPONSE) })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await service.moveEvent(MOVE_EVENT, 'cal2', MOVE_PATCH);
    // First call: createEvent POST to destination calendar
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://graph.microsoft.com/v1.0/me/calendars/cal2/events',
    );
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.subject).toBe('Moved Meeting');
    // Second call: deleteEvent on original
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://graph.microsoft.com/v1.0/me/events/evt1',
    );
    expect(fetchMock.mock.calls[1][1].method).toBe('DELETE');
  });

  it('moveEvent clears the cache on success', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOVE_CREATE_RESPONSE) })
      .mockResolvedValueOnce({ ok: true }),
    );
    await service.moveEvent(MOVE_EVENT, 'cal2', MOVE_PATCH);
    expect(cache.clearAll).toHaveBeenCalled();
  });

  it('moveEvent does not delete original when create fails', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, statusText: 'Forbidden' });
    vi.stubGlobal('fetch', fetchMock);
    await expect(service.moveEvent(MOVE_EVENT, 'cal2', MOVE_PATCH)).rejects.toThrow(
      'Failed to create event: Forbidden',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
