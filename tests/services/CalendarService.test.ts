import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CalendarService } from '../../src/services/CalendarService';
import { AuthService } from '../../src/services/AuthService';
import { CacheService } from '../../src/services/CacheService';
import { M365Event, CachedEvents } from '../../src/types';

const FAKE_EVENT_RESPONSE = {
  id: 'evt1',
  subject: 'Team Standup',
  start: { dateTime: '2026-04-04T09:00:00Z', timeZone: 'UTC' },
  end: { dateTime: '2026-04-04T09:30:00Z', timeZone: 'UTC' },
  isAllDay: false,
  bodyPreview: '',
  webLink: 'https://outlook.office.com/calendar/item/evt1',
};

const EXPECTED_EVENT: M365Event = {
  id: 'evt1',
  subject: 'Team Standup',
  start: { dateTime: '2026-04-04T09:00:00Z', timeZone: 'UTC' },
  end: { dateTime: '2026-04-04T09:30:00Z', timeZone: 'UTC' },
  calendarId: 'cal1',
  isAllDay: false,
  bodyPreview: '',
  webLink: 'https://outlook.office.com/calendar/item/evt1',
};

describe('CalendarService', () => {
  let auth: Pick<AuthService, 'getValidToken'>;
  let cache: Pick<CacheService, 'get' | 'set'>;
  let service: CalendarService;

  beforeEach(() => {
    auth = { getValidToken: vi.fn().mockResolvedValue('token') };
    cache = {
      get: vi.fn().mockReturnValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    };
    service = new CalendarService(
      auth as AuthService,
      cache as CacheService,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

  it('getEvents returns cached events when cache hits', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const cached: CachedEvents = { events: [EXPECTED_EVENT], fetchedAt: Date.now() };
    (cache.get as ReturnType<typeof vi.fn>).mockReturnValue(cached);
    const events = await service.getEvents(['cal1'], new Date('2026-04-01'), new Date('2026-04-30'));
    expect(events).toEqual([EXPECTED_EVENT]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('getEvents fetches from Graph on cache miss and writes to cache', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ value: [FAKE_EVENT_RESPONSE] }),
    }));
    const events = await service.getEvents(['cal1'], new Date('2026-04-01'), new Date('2026-04-30'));
    expect(events[0].subject).toBe('Team Standup');
    expect(events[0].calendarId).toBe('cal1');
    expect(cache.set).toHaveBeenCalled();
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

  it('createEvent posts to Graph and returns mapped event', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        id: 'evt2',
        subject: 'New Event',
        start: { dateTime: '2026-04-05T10:00:00Z', timeZone: 'UTC' },
        end: { dateTime: '2026-04-05T11:00:00Z', timeZone: 'UTC' },
        isAllDay: false,
        bodyPreview: undefined,
        webLink: undefined,
      }),
    }));
    const event = await service.createEvent('cal1', {
      subject: 'New Event',
      start: new Date('2026-04-05T10:00:00Z'),
      end: new Date('2026-04-05T11:00:00Z'),
    });
    expect(event.subject).toBe('New Event');
    expect(event.calendarId).toBe('cal1');
    expect(event.id).toBe('evt2');
  });
});
