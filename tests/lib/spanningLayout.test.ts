import { describe, it, expect } from 'vitest';
import { computeWeekSpanningLayout, isSpanningEvent } from '../../src/lib/spanningLayout';
import { M365Event } from '../../src/types';

// Week of 2026-04-05 (Sunday) through 2026-04-11 (Saturday)
const WEEK_START = new Date('2026-04-05T00:00');

function allDay(id: string, startDate: string, endDate: string): M365Event {
  return {
    id,
    subject: `Event ${id}`,
    start: { dateTime: `${startDate}T00:00:00`, timeZone: 'UTC' },
    end: { dateTime: `${endDate}T00:00:00`, timeZone: 'UTC' },
    calendarId: 'cal1',
    isAllDay: true,
  };
}

function timed(id: string, startDT: string, endDT: string): M365Event {
  return {
    id,
    subject: `Event ${id}`,
    start: { dateTime: startDT, timeZone: 'UTC' },
    end: { dateTime: endDT, timeZone: 'UTC' },
    calendarId: 'cal1',
    isAllDay: false,
  };
}

describe('isSpanningEvent', () => {
  it('returns false for a single-day all-day event', () => {
    expect(isSpanningEvent(allDay('e1', '2026-04-06', '2026-04-07'))).toBe(false);
  });

  it('returns true for a multi-day all-day event', () => {
    expect(isSpanningEvent(allDay('e1', '2026-04-06', '2026-04-09'))).toBe(true);
  });

  it('returns false for a same-day timed event', () => {
    expect(isSpanningEvent(timed('e1', '2026-04-06T09:00:00', '2026-04-06T10:00:00'))).toBe(false);
  });

  it('returns true for a timed event crossing midnight', () => {
    expect(isSpanningEvent(timed('e1', '2026-04-06T22:00:00', '2026-04-07T01:00:00'))).toBe(true);
  });
});

describe('computeWeekSpanningLayout', () => {
  it('excludes single-day all-day events by default', () => {
    const { segments } = computeWeekSpanningLayout(
      [allDay('e1', '2026-04-06', '2026-04-07')],
      WEEK_START,
    );
    expect(segments).toHaveLength(0);
  });

  it('excludes same-day timed events', () => {
    const { segments } = computeWeekSpanningLayout(
      [timed('e1', '2026-04-06T09:00:00', '2026-04-06T10:00:00')],
      WEEK_START,
    );
    expect(segments).toHaveLength(0);
  });

  it('includes multi-day all-day event with correct columns', () => {
    // Apr 6 (Mon) – Apr 8 (Wed), end exclusive Apr 9
    const { segments, totalLanes } = computeWeekSpanningLayout(
      [allDay('e1', '2026-04-06', '2026-04-09')],
      WEEK_START,
    );
    expect(segments).toHaveLength(1);
    expect(segments[0].startCol).toBe(1);   // Monday = col 1
    expect(segments[0].colSpan).toBe(3);    // Mon–Wed = 3 cols
    expect(segments[0].lane).toBe(0);
    expect(segments[0].continuesLeft).toBe(false);
    expect(segments[0].continuesRight).toBe(false);
    expect(totalLanes).toBe(1);
  });

  it('clamps end to Saturday and sets continuesRight for events ending later', () => {
    // Apr 8 (Wed) – Apr 13 (Mon next week)
    const { segments } = computeWeekSpanningLayout(
      [allDay('e1', '2026-04-08', '2026-04-14')],
      WEEK_START,
    );
    expect(segments[0].startCol).toBe(3);   // Wednesday
    expect(segments[0].colSpan).toBe(4);    // Wed–Sat
    expect(segments[0].continuesRight).toBe(true);
    expect(segments[0].continuesLeft).toBe(false);
  });

  it('clamps start to Sunday and sets continuesLeft for events that started earlier', () => {
    // Apr 1 (Wed prev week) – Apr 7 (Tue this week)
    const { segments } = computeWeekSpanningLayout(
      [allDay('e1', '2026-04-01', '2026-04-08')],
      WEEK_START,
    );
    expect(segments[0].startCol).toBe(0);   // Sunday
    expect(segments[0].colSpan).toBe(3);    // Sun–Tue
    expect(segments[0].continuesLeft).toBe(true);
    expect(segments[0].continuesRight).toBe(false);
  });

  it('includes timed cross-midnight event with correct columns', () => {
    // Mon 22:00 – Tue 01:00
    const { segments } = computeWeekSpanningLayout(
      [timed('e1', '2026-04-06T22:00:00', '2026-04-07T01:00:00')],
      WEEK_START,
    );
    expect(segments).toHaveLength(1);
    expect(segments[0].startCol).toBe(1);   // Monday
    expect(segments[0].colSpan).toBe(2);    // Mon–Tue
  });

  it('excludes events entirely before this week', () => {
    const { segments } = computeWeekSpanningLayout(
      [allDay('e1', '2026-03-30', '2026-04-03')],
      WEEK_START,
    );
    expect(segments).toHaveLength(0);
  });

  it('excludes events entirely after this week', () => {
    const { segments } = computeWeekSpanningLayout(
      [allDay('e1', '2026-04-12', '2026-04-15')],
      WEEK_START,
    );
    expect(segments).toHaveLength(0);
  });

  it('assigns overlapping events to different lanes', () => {
    const e1 = allDay('e1', '2026-04-06', '2026-04-09'); // Mon–Wed
    const e2 = allDay('e2', '2026-04-07', '2026-04-10'); // Tue–Thu (overlaps e1)
    const { segments, totalLanes } = computeWeekSpanningLayout([e1, e2], WEEK_START);
    expect(segments).toHaveLength(2);
    const lanes = segments.map((s) => s.lane);
    expect(lanes).toContain(0);
    expect(lanes).toContain(1);
    expect(totalLanes).toBe(2);
  });

  it('packs non-overlapping events into the same lane', () => {
    const e1 = allDay('e1', '2026-04-06', '2026-04-08'); // Mon–Tue
    const e2 = allDay('e2', '2026-04-09', '2026-04-11'); // Wed–Thu (no overlap)
    const { segments, totalLanes } = computeWeekSpanningLayout([e1, e2], WEEK_START);
    expect(segments[0].lane).toBe(0);
    expect(segments[1].lane).toBe(0);
    expect(totalLanes).toBe(1);
  });

  it('includes single-day all-day events when includeAllAllDay is true', () => {
    const { segments } = computeWeekSpanningLayout(
      [allDay('e1', '2026-04-06', '2026-04-07')],
      WEEK_START,
      { includeAllAllDay: true },
    );
    expect(segments).toHaveLength(1);
    expect(segments[0].startCol).toBe(1);
    expect(segments[0].colSpan).toBe(1);
  });
});
