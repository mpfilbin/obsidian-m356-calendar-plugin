import React, { useMemo } from 'react';
import { M365Event, M365Calendar } from '../types';
import { useNow } from '../hooks/useNow';
import { usePopoverContext } from '../PopoverContext';
import { formatTime } from '../lib/datetime';

export interface LayoutEvent {
  event: M365Event;
  column: number;
  columnCount: number;
}

export const PX_PER_MIN = 1;
export const HOURS_IN_DAY = 24;
export const MIN_EVENT_HEIGHT = 15;
export const TIME_LABEL_WIDTH_PX = 52;
export const COLUMN_GAP_PX = 6;

type StampedEvent = { event: M365Event; startMs: number; endMs: number };

export function layoutEvents(events: M365Event[]): LayoutEvent[] {
  const stamped: StampedEvent[] = events
    .map((e) => ({
      event: e,
      startMs: new Date(e.start.dateTime).getTime(),
      endMs: new Date(e.end.dateTime).getTime(),
    }))
    .filter(({ startMs, endMs }) => !isNaN(startMs) && !isNaN(endMs) && endMs > startMs);

  if (stamped.length === 0) return [];

  const sorted = [...stamped].sort((a, b) => a.startMs - b.startMs);

  const clusters: StampedEvent[][] = [];
  for (const s of sorted) {
    const existing = clusters.find((cluster) =>
      cluster.some((other) => s.startMs < other.endMs && s.endMs > other.startMs),
    );
    if (existing) {
      existing.push(s);
    } else {
      clusters.push([s]);
    }
  }

  const result: LayoutEvent[] = [];
  for (const cluster of clusters) {
    const assignments: number[] = new Array(cluster.length).fill(-1);
    for (let i = 0; i < cluster.length; i++) {
      const used = new Set<number>();
      for (let j = 0; j < i; j++) {
        if (cluster[i].startMs < cluster[j].endMs && cluster[i].endMs > cluster[j].startMs) {
          used.add(assignments[j]);
        }
      }
      let col = 0;
      while (used.has(col)) col++;
      assignments[i] = col;
    }
    const colCount = assignments.reduce((m, v) => Math.max(m, v), -1) + 1;
    for (let i = 0; i < cluster.length; i++) {
      result.push({ event: cluster[i].event, column: assignments[i], columnCount: colCount });
    }
  }

  return result;
}

interface TimelineColumnProps {
  date: Date;
  events: M365Event[];
  calendars: M365Calendar[];
  onTimeClick: (date: Date) => void;
  onTimeContextMenu?: (dateTime: Date, event: MouseEvent) => void;
  onEventClick?: (event: M365Event) => void;
  showLabels?: boolean;
  showNowLine?: boolean;
  'data-testid'?: string;
}

export const TimelineColumn: React.FC<TimelineColumnProps> = ({
  date,
  events,
  calendars,
  onTimeClick,
  onTimeContextMenu,
  onEventClick,
  showLabels = false,
  showNowLine = false,
  'data-testid': testId,
}) => {
  const calendarMap = useMemo(() => new Map(calendars.map((c) => [c.id, c])), [calendars]);
  const laid = useMemo(() => layoutEvents(events), [events]);
  const { showPopover, hidePopover } = usePopoverContext();

  const now = useNow(showNowLine);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const computeTimeFromMouseEvent = (e: React.MouseEvent<HTMLDivElement>): Date => {
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const totalMinutes = Math.min(Math.round(offsetY / PX_PER_MIN / 15) * 15, 23 * 60 + 45);
    const d = new Date(date);
    d.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0);
    return d;
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    onTimeClick(computeTimeFromMouseEvent(e));
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    onTimeContextMenu?.(computeTimeFromMouseEvent(e), e.nativeEvent);
  };

  const eventsLeft = showLabels ? TIME_LABEL_WIDTH_PX : 0;

  return (
    <div
      className="m365-timeline-column"
      style={{ position: 'relative', height: `${HOURS_IN_DAY * 60 * PX_PER_MIN}px` }}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      data-testid={testId}
    >
      {Array.from({ length: HOURS_IN_DAY * 4 }, (_, i) => {
        const slotMin = i * 15;
        const hour = Math.floor(slotMin / 60);
        const minute = slotMin % 60;
        const isHour = minute === 0;
        const isHalf = minute === 30;
        return (
          <div
            key={i}
            className={`m365-day-view-slot${isHour ? ' m365-day-view-slot--hour' : isHalf ? ' m365-day-view-slot--half' : ' m365-day-view-slot--quarter'}`}
            style={{ position: 'absolute', top: `${slotMin * PX_PER_MIN}px`, width: '100%' }}
          >
            {showLabels && isHour && (
              <span className="m365-day-view-hour-label">
                {String(hour).padStart(2, '0')}:00
              </span>
            )}
          </div>
        );
      })}
      <div
        className="m365-day-view-events"
        style={{ position: 'absolute', top: 0, left: `${eventsLeft}px`, right: 0, bottom: 0 }}
      >
        {laid.map(({ event, column, columnCount }) => {
          const cal = calendarMap.get(event.calendarId);
          if (!cal) return null;
          const start = new Date(event.start.dateTime);
          const end = new Date(event.end.dateTime);
          const startMin = start.getHours() * 60 + start.getMinutes();
          const durationMin = (end.getTime() - start.getTime()) / 60000;
          const height = Math.max(durationMin, MIN_EVENT_HEIGHT) * PX_PER_MIN;
          const gapPx = columnCount > 1 ? COLUMN_GAP_PX : 0;
          const widthStyle = `calc(${100 / columnCount}% - ${((columnCount - 1) * gapPx) / columnCount}px)`;
          const leftStyle =
            column === 0
              ? '0'
              : `calc(${(column * 100) / columnCount}% + ${(column * gapPx) / columnCount}px)`;
          const startTimeStr = formatTime(start);
          const endTimeStr = formatTime(end);
          return (
            <button
              key={event.id}
              type="button"
              className="m365-event-click-btn m365-day-event-block"
              aria-label={`Edit event: ${event.subject}`}
              style={{
                position: 'absolute',
                top: `${startMin * PX_PER_MIN}px`,
                height: `${height}px`,
                width: widthStyle,
                left: leftStyle,
                backgroundColor: `${cal.color}26`,
                border: `1px solid ${cal.color}`,
                overflow: 'hidden',
              }}
              onMouseEnter={(e) => showPopover(event, cal, e.currentTarget.getBoundingClientRect())}
              onMouseLeave={() => hidePopover()}
              onClick={(e) => {
                e.stopPropagation();
                onEventClick?.(event);
              }}
            >
              <div className="m365-day-event-content">
                <span className="m365-day-event-time" style={{ color: cal.color }}>
                  {startTimeStr} – {endTimeStr}
                </span>
                <span className="m365-day-event-title" style={{ color: cal.color }}>
                  {event.subject}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      {showNowLine && (
        <div
          className="m365-now-line"
          style={{ top: `${nowMinutes * PX_PER_MIN}px` }}
        />
      )}
    </div>
  );
};
