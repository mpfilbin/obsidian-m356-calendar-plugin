function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Format a Date as "YYYY-MM-DD" in local time. */
export function toDateOnly(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Format a Date as "YYYY-MM-DDTHH:MM" in local time, for datetime-local inputs. */
export function toDateTimeLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Format a Date as "YYYY-MM-DDTHH:MM:SS" in local time (no UTC conversion), for Graph API. */
export function toLocalISOString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Parse a string from an HTML date or datetime-local input as a local-time Date.
 * Date-only strings ("YYYY-MM-DD") are treated as local midnight — appending
 * T00:00 prevents the spec-mandated UTC-parse that would shift the date backwards
 * in negative-offset timezones.
 */
export function parseDateInput(s: string): Date {
  return new Date(s.length === 10 ? `${s}T00:00` : s);
}

/** Format a Date as a locale-appropriate short time string, e.g. "2:30 PM" or "14:30". */
export function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Returns the 7 Date objects for the week containing `date`, starting from Sunday. */
export function getWeekDays(date: Date): Date[] {
  const sunday = new Date(date);
  sunday.setDate(date.getDate() - date.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return d;
  });
}

/**
 * Returns the Date objects for a full month calendar grid:
 * all days of the month plus leading days from the previous month (to start on
 * Sunday) and trailing days from the next month (to complete the last row).
 * Total length is always a multiple of 7.
 */
export function getDaysInMonthView(date: Date): Date[] {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days: Date[] = [];

  // Leading days from previous month
  for (let i = firstDay.getDay(); i > 0; i--) {
    days.push(new Date(year, month, 1 - i));
  }
  // Days in current month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(year, month, d));
  }
  // Trailing days to complete the last week
  let trailingDay = 1;
  while (days.length % 7 !== 0) {
    days.push(new Date(year, month + 1, trailingDay++));
  }
  return days;
}
