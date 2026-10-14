import { describe, it, expect } from 'vitest';
import { buildAgenda } from '../../src/lib/agenda';
import { getWeekDays } from '../../src/lib/datetime';
import type { M365Event, M365TodoItem } from '../../src/types';

// Wed 2026-04-08 → week Sun Apr 5 – Sat Apr 11
const days = getWeekDays(new Date(2026, 3, 8));

function ev(id: string, start: string, end: string, extra: Partial<M365Event> = {}): M365Event {
  return {
    id,
    subject: id,
    start: { dateTime: start, timeZone: 'UTC' },
    end: { dateTime: end, timeZone: 'UTC' },
    calendarId: 'cal',
    isAllDay: false,
    ...extra,
  };
}

function todo(id: string, dueDate: string): M365TodoItem {
  return { id, title: id, listId: 'l', dueDate, importance: 'normal' };
}

const ids = (items: ReturnType<typeof buildAgenda>[number]['items']) =>
  items.map((i) => (i.kind === 'event' ? i.event.id : i.todo.id));

describe('buildAgenda', () => {
  it('returns Sunday through Saturday, one group per day', () => {
    const result = buildAgenda(days, [], []);
    expect(result.map((d) => d.dateStr)).toEqual([
      '2026-04-05', '2026-04-06', '2026-04-07', '2026-04-08', '2026-04-09', '2026-04-10', '2026-04-11',
    ]);
    expect(result.every((d) => d.items.length === 0)).toBe(true);
  });

  it('orders all-day events, then tasks, then timed events earliest to latest', () => {
    const events = [
      ev('late', '2026-04-08T15:00:00', '2026-04-08T16:00:00'),
      ev('early', '2026-04-08T08:00:00', '2026-04-08T09:00:00'),
      ev('holiday', '2026-04-08T00:00:00', '2026-04-09T00:00:00', { isAllDay: true }),
      ev('mid', '2026-04-08T12:00:00', '2026-04-08T13:00:00'),
    ];
    const result = buildAgenda(days, events, [todo('task', '2026-04-08')]);
    expect(ids(result[3].items)).toEqual(['holiday', 'task', 'early', 'mid', 'late']);
  });

  it('breaks start-time ties by end time', () => {
    const events = [
      ev('long', '2026-04-08T09:00:00', '2026-04-08T11:00:00'),
      ev('short', '2026-04-08T09:00:00', '2026-04-08T09:30:00'),
    ];
    expect(ids(buildAgenda(days, events, [])[3].items)).toEqual(['short', 'long']);
  });

  it('repeats a multi-day all-day event on each day it covers, end date exclusive', () => {
    const events = [ev('trip', '2026-04-06T00:00:00', '2026-04-09T00:00:00', { isAllDay: true })];
    const result = buildAgenda(days, events, []);
    expect(result.filter((d) => d.items.length).map((d) => d.dateStr)).toEqual([
      '2026-04-06', '2026-04-07', '2026-04-08',
    ]);
  });

  it('shows a timed event that crosses midnight on both days, continuing first on the second', () => {
    const events = [
      ev('overnight', '2026-04-07T22:00:00', '2026-04-08T02:00:00'),
      ev('morning', '2026-04-08T01:00:00', '2026-04-08T01:30:00'),
    ];
    const result = buildAgenda(days, events, []);
    expect(ids(result[2].items)).toEqual(['overnight']);
    expect(ids(result[3].items)).toEqual(['overnight', 'morning']);
    const cont = result[3].items[0];
    expect(cont.kind === 'event' && cont.continues).toBe(true);
  });

  it('flags which day a multi-day timed event actually ends on', () => {
    const result = buildAgenda(days, [ev('long', '2026-04-06T22:00:00', '2026-04-08T09:00:00')], []);
    const flags = [1, 2, 3].map((i) => {
      const it0 = result[i].items[0];
      return it0.kind === 'event' ? [it0.continues, it0.endsToday] : null;
    });
    expect(flags).toEqual([[false, false], [true, false], [true, true]]);
  });

  it('does not spill a timed event ending exactly at midnight onto the next day', () => {
    const events = [ev('late', '2026-04-07T22:00:00', '2026-04-08T00:00:00')];
    const result = buildAgenda(days, events, []);
    expect(ids(result[2].items)).toEqual(['late']);
    expect(result[3].items).toEqual([]);
  });

  it('ignores events and tasks outside the week', () => {
    const result = buildAgenda(
      days,
      [ev('before', '2026-04-04T10:00:00', '2026-04-04T11:00:00'), ev('after', '2026-04-12T10:00:00', '2026-04-12T11:00:00')],
      [todo('t', '2026-04-12')],
    );
    expect(result.every((d) => d.items.length === 0)).toBe(true);
  });
});
