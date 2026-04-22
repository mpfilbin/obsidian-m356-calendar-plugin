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
