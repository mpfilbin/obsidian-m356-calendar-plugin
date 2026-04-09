import { describe, it, expect } from 'vitest';
import { layoutEvents } from '../../src/components/DayView';
import { M365Event } from '../../src/types';

function makeEvent(id: string, startISO: string, endISO: string): M365Event {
  return {
    id,
    subject: id,
    start: { dateTime: startISO, timeZone: 'UTC' },
    end: { dateTime: endISO, timeZone: 'UTC' },
    calendarId: 'cal1',
    isAllDay: false,
  };
}

describe('layoutEvents', () => {
  it('returns empty array for no events', () => {
    expect(layoutEvents([])).toEqual([]);
  });

  it('single event gets column 0, columnCount 1', () => {
    const a = makeEvent('a', '2026-04-09T09:00:00', '2026-04-09T10:00:00');
    const result = layoutEvents([a]);
    expect(result).toEqual([{ event: a, column: 0, columnCount: 1 }]);
  });

  it('two non-overlapping events each get columnCount 1', () => {
    const a = makeEvent('a', '2026-04-09T09:00:00', '2026-04-09T10:00:00');
    const b = makeEvent('b', '2026-04-09T11:00:00', '2026-04-09T12:00:00');
    const result = layoutEvents([a, b]);
    expect(result.find((r) => r.event.id === 'a')).toMatchObject({ column: 0, columnCount: 1 });
    expect(result.find((r) => r.event.id === 'b')).toMatchObject({ column: 0, columnCount: 1 });
  });

  it('two overlapping events get columnCount 2 and different columns', () => {
    const a = makeEvent('a', '2026-04-09T09:00:00', '2026-04-09T10:00:00');
    const b = makeEvent('b', '2026-04-09T09:30:00', '2026-04-09T10:30:00');
    const result = layoutEvents([a, b]);
    const ra = result.find((r) => r.event.id === 'a')!;
    const rb = result.find((r) => r.event.id === 'b')!;
    expect(ra.columnCount).toBe(2);
    expect(rb.columnCount).toBe(2);
    expect(ra.column).not.toBe(rb.column);
  });

  it('three-way overlapping events get columnCount 3 and all different columns', () => {
    const a = makeEvent('a', '2026-04-09T09:00:00', '2026-04-09T11:00:00');
    const b = makeEvent('b', '2026-04-09T09:00:00', '2026-04-09T11:00:00');
    const c = makeEvent('c', '2026-04-09T09:00:00', '2026-04-09T11:00:00');
    const result = layoutEvents([a, b, c]);
    expect(result.every((r) => r.columnCount === 3)).toBe(true);
    expect(new Set(result.map((r) => r.column)).size).toBe(3);
  });

  it('partial overlap chain: A overlaps B, B overlaps C, A does not overlap C — A and C share a column', () => {
    const a = makeEvent('a', '2026-04-09T09:00:00', '2026-04-09T09:45:00');
    const b = makeEvent('b', '2026-04-09T09:30:00', '2026-04-09T10:15:00');
    const c = makeEvent('c', '2026-04-09T10:00:00', '2026-04-09T10:45:00');
    const result = layoutEvents([a, b, c]);
    const ra = result.find((r) => r.event.id === 'a')!;
    const rb = result.find((r) => r.event.id === 'b')!;
    const rc = result.find((r) => r.event.id === 'c')!;
    expect(ra.column).toBe(rc.column);
    expect(rb.column).not.toBe(ra.column);
    expect(ra.columnCount).toBe(2);
    expect(rb.columnCount).toBe(2);
    expect(rc.columnCount).toBe(2);
  });

  it('filters out events with invalid datetimes', () => {
    const valid = makeEvent('valid', '2026-04-09T09:00:00', '2026-04-09T10:00:00');
    const invalid = { ...makeEvent('bad', 'not-a-date', '2026-04-09T10:00:00') };
    const result = layoutEvents([valid, invalid]);
    expect(result).toHaveLength(1);
    expect(result[0].event.id).toBe('valid');
  });
});
