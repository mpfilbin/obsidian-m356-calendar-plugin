import { describe, it, expect } from 'vitest';
import { shiftEventByDays, moveEventToTime, dayDelta } from '../../src/lib/reschedule';
import type { M365Event } from '../../src/types';

const base: M365Event = {
  id: 'e1',
  subject: 'Standup',
  calendarId: 'c1',
  isAllDay: false,
  start: { dateTime: '2026-04-10T09:30:00.0000000', timeZone: 'America/New_York' },
  end: { dateTime: '2026-04-10T10:15:00.0000000', timeZone: 'America/New_York' },
};

describe('dayDelta', () => {
  it('counts calendar days between two dates', () => {
    expect(dayDelta('2026-04-10', '2026-04-13')).toBe(3);
    expect(dayDelta('2026-04-10', '2026-04-08')).toBe(-2);
    expect(dayDelta('2026-04-10', '2026-04-10')).toBe(0);
  });
});

describe('shiftEventByDays', () => {
  it('returns null when the delta is zero', () => {
    expect(shiftEventByDays(base, 0)).toBeNull();
  });

  it('moves start and end by whole days and keeps time of day and zone', () => {
    expect(shiftEventByDays(base, 3)).toEqual({
      start: { dateTime: '2026-04-13T09:30:00', timeZone: 'America/New_York' },
      end: { dateTime: '2026-04-13T10:15:00', timeZone: 'America/New_York' },
    });
  });

  it('moves backwards across a month boundary', () => {
    expect(shiftEventByDays(base, -10)?.start.dateTime).toBe('2026-03-31T09:30:00');
  });

  it('keeps the wall-clock time across a daylight-saving change', () => {
    const e = { ...base, start: { ...base.start, dateTime: '2026-03-07T09:00:00' }, end: { ...base.end, dateTime: '2026-03-07T10:00:00' } };
    expect(shiftEventByDays(e, 2)?.start.dateTime).toBe('2026-03-09T09:00:00');
  });

  it('keeps a multi-day all-day event the same length', () => {
    const allDay: M365Event = {
      ...base,
      isAllDay: true,
      start: { dateTime: '2026-04-10T00:00:00', timeZone: 'UTC' },
      end: { dateTime: '2026-04-13T00:00:00', timeZone: 'UTC' },
    };
    expect(shiftEventByDays(allDay, 7)).toEqual({
      start: { dateTime: '2026-04-17T00:00:00', timeZone: 'UTC' },
      end: { dateTime: '2026-04-20T00:00:00', timeZone: 'UTC' },
    });
  });
});

describe('moveEventToTime', () => {
  it('moves to the given day and time, keeping the duration', () => {
    expect(moveEventToTime(base, '2026-04-11', 14 * 60)).toEqual({
      start: { dateTime: '2026-04-11T14:00:00', timeZone: 'America/New_York' },
      end: { dateTime: '2026-04-11T14:45:00', timeZone: 'America/New_York' },
    });
  });

  it('snaps to 15 minutes', () => {
    expect(moveEventToTime(base, '2026-04-10', 10 * 60 + 8)?.start.dateTime).toBe('2026-04-10T10:15:00');
    expect(moveEventToTime(base, '2026-04-10', 10 * 60 + 7)?.start.dateTime).toBe('2026-04-10T10:00:00');
  });

  it('clamps so the event ends by midnight', () => {
    // 45 minute event dropped at 23:30 must start by 23:15
    expect(moveEventToTime(base, '2026-04-10', 23 * 60 + 30)).toEqual({
      start: { dateTime: '2026-04-10T23:15:00', timeZone: 'America/New_York' },
      end: { dateTime: '2026-04-11T00:00:00', timeZone: 'America/New_York' },
    });
  });

  it('clamps negative offsets to midnight', () => {
    expect(moveEventToTime(base, '2026-04-10', -40)?.start.dateTime).toBe('2026-04-10T00:00:00');
  });

  it('returns null when the snapped position is where the event already is', () => {
    expect(moveEventToTime(base, '2026-04-10', 9 * 60 + 30)).toBeNull();
  });

  it('returns null for unparseable times', () => {
    expect(moveEventToTime({ ...base, start: { dateTime: 'nope', timeZone: 'UTC' } }, '2026-04-10', 600)).toBeNull();
  });
});
