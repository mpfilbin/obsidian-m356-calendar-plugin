import { SNAP_MINUTES } from './reschedule';

const MINUTES_PER_DAY = 24 * 60;

/** A span of a single day, in minutes after midnight. `endMin` may be 1440 (the end of the day). */
export interface MinuteRange {
  startMin: number;
  endMin: number;
}

/** A pointer offset (in minutes after midnight) limited to the day. */
export function clampMinutes(minutes: number): number {
  return Math.min(Math.max(minutes, 0), MINUTES_PER_DAY);
}

/**
 * The range covered by dragging from `anchorMin` to `currentMin`, in either direction. It grows
 * outwards to whole 15-minute slots, so every slot the pointer touched is selected and a range is
 * never empty.
 */
export function selectionRange(anchorMin: number, currentMin: number): MinuteRange {
  const low = clampMinutes(Math.min(anchorMin, currentMin));
  const high = clampMinutes(Math.max(anchorMin, currentMin));
  const startMin = Math.min(Math.floor(low / SNAP_MINUTES) * SNAP_MINUTES, MINUTES_PER_DAY - SNAP_MINUTES);
  const endMin = Math.max(Math.ceil(high / SNAP_MINUTES) * SNAP_MINUTES, startMin + SNAP_MINUTES);
  return { startMin, endMin: Math.min(endMin, MINUTES_PER_DAY) };
}

/** The local Date `minutes` after midnight on `day`. 1440 gives midnight at the end of the day. */
export function dateAtMinutes(day: Date, minutes: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minutes, 0, 0);
}
