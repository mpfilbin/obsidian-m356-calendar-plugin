import React, { useMemo } from 'react';
import { M365Event, M365Calendar } from '../types';
import { EventCard } from './EventCard';

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
    const colCount = assignments.reduce((m, v) => Math.max(m, v), 0) + 1;
    for (let i = 0; i < cluster.length; i++) {
      result.push({ event: cluster[i], column: assignments[i], columnCount: colCount });
    }
  }

  return result;
}

interface DayViewProps {
  currentDate: Date;
  events: M365Event[];
  calendars: M365Calendar[];
  onTimeClick: (date: Date) => void;
  onEventClick?: (event: M365Event) => void;
}

export const DayView: React.FC<DayViewProps> = ({
  currentDate,
  events,
  calendars,
  onTimeClick,
  onEventClick,
}) => {
  const calendarMap = useMemo(() => new Map(calendars.map((c) => [c.id, c])), [calendars]);
  const allDayEvents = useMemo(() => events.filter((e) => e.isAllDay), [events]);
  const timedEvents = useMemo(() => events.filter((e) => !e.isAllDay), [events]);
  const laid = useMemo(() => layoutEvents(timedEvents), [timedEvents]);

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const totalMinutes = Math.min(Math.round(offsetY / PX_PER_MIN / 15) * 15, 23 * 60 + 45);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const date = new Date(currentDate);
    date.setHours(hours, minutes, 0, 0);
    onTimeClick(date);
  };

  return (
    <div className="m365-day-view">
      {allDayEvents.length > 0 && (
        <div className="m365-day-view-allday">
          {allDayEvents.map((event) => {
            const cal = calendarMap.get(event.calendarId);
            if (!cal) return null;
            return (
              <button
                key={event.id}
                type="button"
                className="m365-event-click-btn"
                aria-label={`Edit event: ${event.subject}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onEventClick?.(event);
                }}
              >
                <EventCard event={event} calendar={cal} />
              </button>
            );
          })}
        </div>
      )}
      <div
        className="m365-day-view-timeline"
        style={{ position: 'relative', height: `${HOURS_IN_DAY * 60 * PX_PER_MIN}px` }}
        onClick={handleTimelineClick}
        data-testid="m365-day-timeline"
      >
        {Array.from({ length: HOURS_IN_DAY }, (_, h) => (
          <div
            key={h}
            className="m365-day-view-hour"
            style={{ position: 'absolute', top: `${h * 60 * PX_PER_MIN}px`, width: '100%' }}
          >
            <span className="m365-day-view-hour-label">
              {String(h).padStart(2, '0')}:00
            </span>
          </div>
        ))}
        {laid.map(({ event, column, columnCount }) => {
          const cal = calendarMap.get(event.calendarId);
          if (!cal) return null;
          const start = new Date(event.start.dateTime);
          const end = new Date(event.end.dateTime);
          const startMin = start.getHours() * 60 + start.getMinutes();
          const durationMin = (end.getTime() - start.getTime()) / 60000;
          const height = Math.max(durationMin, MIN_EVENT_HEIGHT) * PX_PER_MIN;
          const width = 100 / columnCount;
          const left = column * width;
          return (
            <button
              key={event.id}
              type="button"
              className="m365-event-click-btn"
              aria-label={`Edit event: ${event.subject}`}
              style={{
                position: 'absolute',
                top: `${startMin * PX_PER_MIN}px`,
                height: `${height}px`,
                width: `${width}%`,
                left: `${left}%`,
                backgroundColor: `${cal.color}26`,
              }}
              onClick={(e) => {
                e.stopPropagation();
                onEventClick?.(event);
              }}
            >
              <EventCard event={event} calendar={cal} />
            </button>
          );
        })}
      </div>
    </div>
  );
};
