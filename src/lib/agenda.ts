import type { M365Event, M365TodoItem } from '../types';
import { toDateOnly } from './datetime';

export type AgendaItem =
  | { kind: 'event'; event: M365Event; allDay: boolean; continues: boolean }
  | { kind: 'todo'; todo: M365TodoItem };

export interface AgendaDay {
  date: Date;
  dateStr: string;
  items: AgendaItem[];
}

/** Last calendar day (inclusive, "YYYY-MM-DD") that `event` occupies. */
function lastDay(event: M365Event): string {
  const startDay = event.start.dateTime.slice(0, 10);
  const endDay = event.end.dateTime.slice(0, 10);
  if (endDay <= startDay) return startDay;
  // All-day ends are exclusive, and a timed event ending exactly at midnight doesn't touch that day.
  const endsAtMidnight = event.isAllDay || event.end.dateTime.slice(11, 16) === '00:00';
  if (!endsAtMidnight) return endDay;
  const [y, m, d] = endDay.split('-').map(Number);
  return toDateOnly(new Date(y, m - 1, d - 1));
}

function startMinutes(event: M365Event): number {
  const hh = Number(event.start.dateTime.slice(11, 13));
  const mm = Number(event.start.dateTime.slice(14, 16));
  return hh * 60 + mm;
}

function endMinutes(event: M365Event): number {
  const hh = Number(event.end.dateTime.slice(11, 13));
  const mm = Number(event.end.dateTime.slice(14, 16));
  return hh * 60 + mm;
}

/**
 * Groups events and tasks by day for the given days.
 *
 * Within each day: all-day events first, then tasks (which only carry a due date), then timed
 * events from earliest to latest. Multi-day events appear on every day they occupy; on the days
 * after the first they sort to the top of the timed events, since they are already under way.
 */
export function buildAgenda(
  days: Date[],
  events: M365Event[],
  todos: M365TodoItem[],
): AgendaDay[] {
  return days.map((date) => {
    const dateStr = toDateOnly(date);

    const allDay: AgendaItem[] = [];
    const timed: Array<{ item: AgendaItem; start: number; end: number; subject: string }> = [];

    for (const event of events) {
      const first = event.start.dateTime.slice(0, 10);
      if (first > dateStr || lastDay(event) < dateStr) continue;
      if (event.isAllDay) {
        allDay.push({ kind: 'event', event, allDay: true, continues: first < dateStr });
      } else {
        const continues = first < dateStr;
        timed.push({
          item: { kind: 'event', event, allDay: false, continues },
          start: continues ? 0 : startMinutes(event),
          end: endMinutes(event),
          subject: event.subject,
        });
      }
    }

    allDay.sort((a, b) =>
      a.kind === 'event' && b.kind === 'event' ? a.event.subject.localeCompare(b.event.subject) : 0,
    );
    timed.sort((a, b) => a.start - b.start || a.end - b.end || a.subject.localeCompare(b.subject));

    const dayTodos: AgendaItem[] = todos
      .filter((t) => t.dueDate === dateStr)
      .map((todo) => ({ kind: 'todo', todo }));

    return { date, dateStr, items: [...allDay, ...dayTodos, ...timed.map((t) => t.item)] };
  });
}
