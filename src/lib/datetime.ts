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
