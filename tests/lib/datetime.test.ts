import { describe, it, expect } from 'vitest';
import { toDateOnly, toDateTimeLocal, toLocalISOString, parseDateInput, formatTime, getWeekDays, getDaysInMonthView, getDateRange, getDatesInRange } from '../../src/lib/datetime';

// All Date objects are constructed with the local-time constructor (year, month, day, ...)
// so these tests are timezone-independent.

describe('toDateOnly', () => {
  it('formats a date as YYYY-MM-DD in local time', () => {
    expect(toDateOnly(new Date(2026, 3, 8))).toBe('2026-04-08');
  });

  it('zero-pads single-digit month and day', () => {
    expect(toDateOnly(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('uses local date getters, not UTC', () => {
    // Midnight local on Dec 31 — regardless of UTC offset this stays Dec 31
    expect(toDateOnly(new Date(2025, 11, 31))).toBe('2025-12-31');
  });
});

describe('toDateTimeLocal', () => {
  it('formats a date as YYYY-MM-DDTHH:MM in local time', () => {
    expect(toDateTimeLocal(new Date(2026, 3, 8, 14, 30))).toBe('2026-04-08T14:30');
  });

  it('zero-pads hours and minutes', () => {
    expect(toDateTimeLocal(new Date(2026, 3, 8, 9, 5))).toBe('2026-04-08T09:05');
  });

  it('does not include seconds', () => {
    const result = toDateTimeLocal(new Date(2026, 3, 8, 14, 30, 45));
    expect(result).toBe('2026-04-08T14:30');
  });
});

describe('toLocalISOString', () => {
  it('formats a date as YYYY-MM-DDTHH:MM:SS in local time', () => {
    expect(toLocalISOString(new Date(2026, 3, 8, 14, 30, 45))).toBe('2026-04-08T14:30:45');
  });

  it('zero-pads seconds', () => {
    expect(toLocalISOString(new Date(2026, 3, 8, 9, 5, 3))).toBe('2026-04-08T09:05:03');
  });

  it('includes seconds unlike toDateTimeLocal', () => {
    const d = new Date(2026, 3, 8, 14, 30, 0);
    expect(toLocalISOString(d)).toBe('2026-04-08T14:30:00');
    expect(toDateTimeLocal(d)).toBe('2026-04-08T14:30');
  });
});

describe('parseDateInput', () => {
  it('parses a date-only string as local midnight', () => {
    const d = parseDateInput('2026-04-08');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(3); // April
    expect(d.getDate()).toBe(8);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it('parses a datetime-local string preserving the time', () => {
    const d = parseDateInput('2026-04-08T14:30');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(3);
    expect(d.getDate()).toBe(8);
    expect(d.getHours()).toBe(14);
    expect(d.getMinutes()).toBe(30);
  });
});

describe('formatTime', () => {
  it('returns a string containing the minutes', () => {
    expect(formatTime(new Date(2026, 3, 8, 14, 30))).toContain('30');
  });

  it('returns a string containing the minute component', () => {
    // toLocaleTimeString output is locale-dependent (12h vs 24h), but the
    // minute value 45 must appear regardless of locale.
    expect(formatTime(new Date(2026, 3, 8, 9, 45))).toContain('45');
  });
});

describe('getWeekDays', () => {
  it('returns exactly 7 dates', () => {
    expect(getWeekDays(new Date(2026, 3, 14))).toHaveLength(7);
  });

  it('first date is always Sunday', () => {
    // April 14, 2026 is Tuesday — week should start Sunday April 12
    const days = getWeekDays(new Date(2026, 3, 14));
    expect(days[0].getDay()).toBe(0);
  });

  it('dates are consecutive', () => {
    const days = getWeekDays(new Date(2026, 3, 14)); // all within April, safe for +1 checks
    for (let i = 1; i < 7; i++) {
      expect(days[i].getDate()).toBe(days[i - 1].getDate() + 1);
    }
  });

  it('returns the same week when input is already Sunday', () => {
    // April 12, 2026 is Sunday
    const days = getWeekDays(new Date(2026, 3, 12));
    expect(days[0]).toEqual(new Date(2026, 3, 12));
  });

  it('returns correct week when input is Saturday', () => {
    // April 18, 2026 is Saturday — week still starts April 12
    const days = getWeekDays(new Date(2026, 3, 18));
    expect(days[0]).toEqual(new Date(2026, 3, 12));
  });
});

describe('getDaysInMonthView', () => {
  it('total count is always a multiple of 7', () => {
    expect(getDaysInMonthView(new Date(2026, 3, 1)).length % 7).toBe(0);
    expect(getDaysInMonthView(new Date(2026, 0, 1)).length % 7).toBe(0);
  });

  it('first date in the grid is always Sunday', () => {
    expect(getDaysInMonthView(new Date(2026, 3, 1))[0].getDay()).toBe(0);
  });

  it('contains all days of the requested month', () => {
    // April 2026 has 30 days
    const days = getDaysInMonthView(new Date(2026, 3, 1));
    const aprilDays = days.filter((d) => d.getMonth() === 3 && d.getFullYear() === 2026);
    expect(aprilDays).toHaveLength(30);
  });

  it('includes leading days from previous month when 1st is not Sunday', () => {
    // April 1, 2026 is Wednesday (getDay() = 3) → 3 leading days: March 29, 30, 31
    const days = getDaysInMonthView(new Date(2026, 3, 1));
    expect(days[0].getMonth()).toBe(2); // March
    expect(days[0].getDate()).toBe(29);
  });

  it('starts directly on the 1st when the month begins on Sunday', () => {
    // March 1, 2026 is Sunday — no leading days
    const days = getDaysInMonthView(new Date(2026, 2, 1));
    expect(days[0]).toEqual(new Date(2026, 2, 1));
  });

  it('trailing days belong to the next month', () => {
    // April 2026: 3 leading + 30 days = 33 → pad to 35 → May 1, May 2 are trailing
    const days = getDaysInMonthView(new Date(2026, 3, 1));
    const last = days[days.length - 1];
    expect(last.getMonth()).toBe(4); // May
  });
});

describe('getDateRange', () => {
  it('month view: start is first of month, end is first of next month', () => {
    const { start, end } = getDateRange(new Date(2026, 3, 14), 'month');
    expect(start).toEqual(new Date(2026, 3, 1));
    expect(end).toEqual(new Date(2026, 4, 1));
  });

  it('day view: start is start of day, end is start of next day', () => {
    const { start, end } = getDateRange(new Date(2026, 3, 14, 15, 30), 'day');
    expect(start).toEqual(new Date(2026, 3, 14));
    expect(end).toEqual(new Date(2026, 3, 15));
  });

  it('week view: start is Sunday at local midnight, end is next Sunday', () => {
    // April 14, 2026 is Tuesday — week starts Sunday April 12
    const { start, end } = getDateRange(new Date(2026, 3, 14), 'week');
    expect(start).toEqual(new Date(2026, 3, 12, 0, 0, 0, 0));
    expect(end).toEqual(new Date(2026, 3, 19, 0, 0, 0, 0));
  });

  it('week view: start is the same day when input is already Sunday', () => {
    const { start } = getDateRange(new Date(2026, 3, 12), 'week'); // Sunday April 12
    expect(start).toEqual(new Date(2026, 3, 12, 0, 0, 0, 0));
  });
});

describe('getDatesInRange', () => {
  it('returns the correct number of date strings', () => {
    expect(getDatesInRange(new Date(2026, 3, 1), new Date(2026, 3, 4))).toHaveLength(3);
  });

  it('strings are in YYYY-MM-DD format', () => {
    const dates = getDatesInRange(new Date(2026, 3, 1), new Date(2026, 3, 3));
    expect(dates[0]).toBe('2026-04-01');
    expect(dates[1]).toBe('2026-04-02');
  });

  it('range is half-open: includes start, excludes end', () => {
    const dates = getDatesInRange(new Date(2026, 3, 1), new Date(2026, 3, 4));
    expect(dates).toEqual(['2026-04-01', '2026-04-02', '2026-04-03']);
    expect(dates).not.toContain('2026-04-04');
  });

  it('returns an empty array when start equals end', () => {
    const d = new Date(2026, 3, 1);
    expect(getDatesInRange(d, d)).toHaveLength(0);
  });
});
