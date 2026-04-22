import { describe, it, expect } from 'vitest';
import { toDateOnly, toDateTimeLocal, toLocalISOString, parseDateInput, formatTime } from '../../src/lib/datetime';

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

  it('returns a string containing the hours in some form', () => {
    // toLocaleTimeString output is locale-dependent (12h vs 24h), but the
    // minute value 45 must appear regardless of locale.
    expect(formatTime(new Date(2026, 3, 8, 9, 45))).toContain('45');
  });
});
