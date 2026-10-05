import type { EventPatch, M365Event } from '../types';
import { addDaysToDateOnly, daysBetweenDateOnly, toLocalISOString } from './datetime';

/** Timeline drops snap to this many minutes. */
export const SNAP_MINUTES = 15;

const MINUTES_PER_DAY = 24 * 60;

/** "YYYY-MM-DD" part of a Graph wall-clock dateTime. */
function datePart(dateTime: string): string {
  return dateTime.slice(0, 10);
}

/** "THH:mm:ss" part of a Graph wall-clock dateTime (drops fractional seconds). */
function timePart(dateTime: string): string {
  return dateTime.slice(10, 19);
}

/** Whole calendar days from `from` to `to` ("YYYY-MM-DD"). */
export function dayDelta(from: string, to: string): number {
  return daysBetweenDateOnly(from, to);
}

/**
 * Moves an event by whole calendar days, keeping its time of day and length.
 * Works on wall-clock strings so daylight-saving changes never shift the time.
 * Returns null when nothing would change.
 */
export function shiftEventByDays(event: M365Event, days: number): Required<Pick<EventPatch, 'start' | 'end'>> | null {
  if (!Number.isFinite(days) || days === 0) return null;
  const shift = (v: { dateTime: string; timeZone: string }) => ({
    dateTime: `${addDaysToDateOnly(datePart(v.dateTime), days)}${timePart(v.dateTime)}`,
    timeZone: v.timeZone,
  });
  return { start: shift(event.start), end: shift(event.end) };
}

/**
 * Moves a timed event so it starts on `date` at `startMinutes` after midnight (snapped to
 * 15 minutes), keeping its length. The start is clamped so the event stays within that day.
 * Returns null when the event would not move.
 */
export function moveEventToTime(
  event: M365Event,
  date: string,
  startMinutes: number,
): Required<Pick<EventPatch, 'start' | 'end'>> | null {
  const duration = eventDurationMinutes(event);
  if (duration === null) return null;
  const start = snapStartMinutes(startMinutes, duration);

  const [y, m, d] = date.split('-').map(Number);
  const newStart = new Date(y, m - 1, d, 0, start, 0, 0);
  const newEnd = new Date(newStart.getTime() + duration * 60000);
  const patch = {
    start: { dateTime: toLocalISOString(newStart), timeZone: event.start.timeZone },
    end: { dateTime: toLocalISOString(newEnd), timeZone: event.end.timeZone },
  };
  const unchanged = patch.start.dateTime === event.start.dateTime.slice(0, 19)
    && patch.end.dateTime === event.end.dateTime.slice(0, 19);
  return unchanged ? null : patch;
}

/** Length of a timed event in whole minutes (at least 1), or null if its times are unparseable. */
export function eventDurationMinutes(event: M365Event): number | null {
  const start = new Date(event.start.dateTime.slice(0, 19));
  const end = new Date(event.end.dateTime.slice(0, 19));
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));
}

/** Snaps a start time to 15 minutes and clamps it so an event of `durationMinutes` ends by midnight. */
export function snapStartMinutes(startMinutes: number, durationMinutes: number): number {
  const latestStart = Math.max(0, MINUTES_PER_DAY - durationMinutes);
  const snapped = Math.round(startMinutes / SNAP_MINUTES) * SNAP_MINUTES;
  return Math.min(Math.max(0, snapped), latestStart);
}
