import { describe, it, expect } from 'vitest';
import { clampMinutes, dateAtMinutes, selectionRange } from '../../src/lib/timeSelection';

describe('selectionRange', () => {
  it('grows outwards to whole 15-minute slots', () => {
    // 09:07 → 10:22 touches the 09:00 slot through the 10:15 slot.
    expect(selectionRange(9 * 60 + 7, 10 * 60 + 22)).toEqual({ startMin: 9 * 60, endMin: 10 * 60 + 30 });
  });

  it('is the same range when dragged upwards', () => {
    expect(selectionRange(10 * 60 + 22, 9 * 60 + 7)).toEqual(selectionRange(9 * 60 + 7, 10 * 60 + 22));
  });

  it('selects one slot when the pointer stays within it', () => {
    expect(selectionRange(100, 100)).toEqual({ startMin: 90, endMin: 105 });
    expect(selectionRange(90, 90)).toEqual({ startMin: 90, endMin: 105 });
  });

  it('keeps exact slot boundaries', () => {
    expect(selectionRange(60, 120)).toEqual({ startMin: 60, endMin: 120 });
  });

  it('clamps to the day', () => {
    expect(selectionRange(-50, 30)).toEqual({ startMin: 0, endMin: 30 });
    expect(selectionRange(23 * 60, 5000)).toEqual({ startMin: 23 * 60, endMin: 1440 });
    expect(selectionRange(1440, 1440)).toEqual({ startMin: 1425, endMin: 1440 });
  });
});

describe('clampMinutes', () => {
  it('limits to 0..1440', () => {
    expect(clampMinutes(-5)).toBe(0);
    expect(clampMinutes(600)).toBe(600);
    expect(clampMinutes(2000)).toBe(1440);
  });
});

describe('dateAtMinutes', () => {
  it('returns the local time on the given day', () => {
    const d = dateAtMinutes(new Date(2026, 3, 9, 15, 42), 9 * 60 + 30);
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 3, 9, 9, 30]);
  });

  it('rolls 1440 over to midnight at the end of the day', () => {
    const d = dateAtMinutes(new Date(2026, 3, 9), 1440);
    expect([d.getDate(), d.getHours(), d.getMinutes()]).toEqual([10, 0, 0]);
  });
});
