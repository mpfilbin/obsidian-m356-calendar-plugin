import { describe, it, expect } from 'vitest';
import { toDateOnly, toDateTimeLocal, toLocalISOString } from '../../src/lib/datetime';

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
