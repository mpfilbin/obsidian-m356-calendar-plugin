import { M365Event } from '../types';

export interface LayoutEvent {
  event: M365Event;
  column: number;
  columnCount: number;
}

export const PX_PER_MIN = 1;
export const HOURS_IN_DAY = 24;
export const MIN_EVENT_HEIGHT = 15;

export function layoutEvents(events: M365Event[]): LayoutEvent[] {
  const valid = events.filter((e) => {
    const s = new Date(e.start.dateTime);
    const end = new Date(e.end.dateTime);
    return !isNaN(s.getTime()) && !isNaN(end.getTime());
  });

  if (valid.length === 0) return [];

  const sorted = [...valid].sort(
    (a, b) =>
      new Date(a.start.dateTime).getTime() - new Date(b.start.dateTime).getTime(),
  );

  // Group into clusters: transitive sets of overlapping events
  const clusters: M365Event[][] = [];
  for (const event of sorted) {
    const eStart = new Date(event.start.dateTime).getTime();
    const eEnd = new Date(event.end.dateTime).getTime();
    const existing = clusters.find((cluster) =>
      cluster.some((other) => {
        const oStart = new Date(other.start.dateTime).getTime();
        const oEnd = new Date(other.end.dateTime).getTime();
        return eStart < oEnd && eEnd > oStart;
      }),
    );
    if (existing) {
      existing.push(event);
    } else {
      clusters.push([event]);
    }
  }

  // Assign columns within each cluster
  const result: LayoutEvent[] = [];
  for (const cluster of clusters) {
    const assignments: number[] = new Array(cluster.length).fill(-1);
    for (let i = 0; i < cluster.length; i++) {
      const eStart = new Date(cluster[i].start.dateTime).getTime();
      const eEnd = new Date(cluster[i].end.dateTime).getTime();
      const used = new Set<number>();
      for (let j = 0; j < i; j++) {
        const oStart = new Date(cluster[j].start.dateTime).getTime();
        const oEnd = new Date(cluster[j].end.dateTime).getTime();
        if (eStart < oEnd && eEnd > oStart) used.add(assignments[j]);
      }
      let col = 0;
      while (used.has(col)) col++;
      assignments[i] = col;
    }
    const colCount = Math.max(...assignments) + 1;
    for (let i = 0; i < cluster.length; i++) {
      result.push({ event: cluster[i], column: assignments[i], columnCount: colCount });
    }
  }

  return result;
}
