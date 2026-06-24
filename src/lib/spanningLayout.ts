import { M365Event } from '../types';
import { toDateOnly } from './datetime';

export interface SpanningSegment {
  event: M365Event;
  startCol: number;
  colSpan: number;
  lane: number;
  continuesLeft: boolean;
  continuesRight: boolean;
}

export interface WeekSpanningLayout {
  segments: SpanningSegment[];
  totalLanes: number;
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00`);
  d.setDate(d.getDate() + n);
  return toDateOnly(d);
}

export function isSpanningEvent(event: M365Event): boolean {
  const startDate = event.start.dateTime.slice(0, 10);
  const endDate = event.end.dateTime.slice(0, 10);
  if (event.isAllDay) {
    // All-day end is exclusive; single-day has endDate = startDate + 1.
    // Spanning means more than one day: endDate > startDate + 1.
    return endDate > addDays(startDate, 1);
  }
  return endDate > startDate;
}

export function computeWeekSpanningLayout(
  events: M365Event[],
  weekStart: Date,
  options: { includeAllAllDay?: boolean } = {},
): WeekSpanningLayout {
  const weekStartStr = toDateOnly(weekStart);
  const weekEndDate = new Date(weekStart);
  weekEndDate.setDate(weekStart.getDate() + 6);
  const weekEndStr = toDateOnly(weekEndDate);

  function inclusiveEnd(e: M365Event): string {
    const endStr = e.end.dateTime.slice(0, 10);
    return e.isAllDay ? addDays(endStr, -1) : endStr;
  }

  const relevant = events.filter((e) => {
    const startDate = e.start.dateTime.slice(0, 10);
    const endDate = inclusiveEnd(e);
    if (startDate > weekEndStr || endDate < weekStartStr) return false;
    if (isSpanningEvent(e)) return true;
    if (options.includeAllAllDay && e.isAllDay) return true;
    return false;
  });

  relevant.sort((a, b) => {
    const aStart = a.start.dateTime.slice(0, 10);
    const bStart = b.start.dateTime.slice(0, 10);
    if (aStart !== bStart) return aStart < bStart ? -1 : 1;
    const aEnd = inclusiveEnd(a);
    const bEnd = inclusiveEnd(b);
    if (aEnd !== bEnd) return aEnd > bEnd ? -1 : 1;
    return 0;
  });

  const laneSlots: Array<Array<{ startCol: number; endCol: number }>> = [];

  const segments: SpanningSegment[] = relevant.map((event) => {
    const eventStart = event.start.dateTime.slice(0, 10);
    const eventEnd = inclusiveEnd(event);

    const continuesLeft = eventStart < weekStartStr;
    const continuesRight = eventEnd > weekEndStr;

    const clampedStart = continuesLeft ? weekStartStr : eventStart;
    const clampedEnd = continuesRight ? weekEndStr : eventEnd;

    const startCol = new Date(`${clampedStart}T00:00`).getDay();
    const endCol = new Date(`${clampedEnd}T00:00`).getDay();
    const colSpan = endCol - startCol + 1;

    let lane = 0;
    for (;;) {
      if (!laneSlots[lane]) laneSlots[lane] = [];
      const conflict = laneSlots[lane].some(
        (slot) => slot.startCol <= endCol && slot.endCol >= startCol,
      );
      if (!conflict) {
        laneSlots[lane].push({ startCol, endCol });
        break;
      }
      lane++;
    }

    return { event, startCol, colSpan, lane, continuesLeft, continuesRight };
  });

  return { segments, totalLanes: laneSlots.length };
}
