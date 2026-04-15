import React, { useMemo, useRef, useEffect } from 'react';
import { M365Event, M365Calendar } from '../types';
import { EventCard } from './EventCard';
import { TimelineColumn, HOURS_IN_DAY, PX_PER_MIN } from './TimelineColumn';
import { toDateOnly } from '../lib/datetime';
import { useNow } from '../hooks/useNow';

interface WeekViewProps {
  currentDate: Date;
  events: M365Event[];
  calendars: M365Calendar[];
  onDayClick: (date: Date) => void;
  onEventClick?: (event: M365Event) => void;
}

function getWeekDays(date: Date): Date[] {
  const sunday = new Date(date);
  sunday.setDate(date.getDate() - date.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return d;
  });
}

export const WeekView: React.FC<WeekViewProps> = ({
  currentDate,
  events,
  calendars,
  onDayClick,
  onEventClick,
}) => {
  const weekDays = getWeekDays(currentDate);
  const calendarMap = useMemo(() => new Map(calendars.map((c) => [c.id, c])), [calendars]);
  const eventsByDate = useMemo(() => {
    const map = new Map<string, { allDay: M365Event[]; timed: M365Event[] }>();
    for (const event of events) {
      const key = event.start.dateTime.slice(0, 10);
      if (!map.has(key)) map.set(key, { allDay: [], timed: [] });
      const bucket = map.get(key)!;
      if (event.isAllDay) bucket.allDay.push(event);
      else bucket.timed.push(event);
    }
    return map;
  }, [events]);
  const now = useNow();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const isCurrentWeek = useMemo(() => {
    return weekDays.some(
      (d) =>
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate(),
    );
  }, [weekDays, now]);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isCurrentWeek || !scrollRef.current) return;
    const container = scrollRef.current;
    const target = nowMinutes * PX_PER_MIN - container.clientHeight / 2;
    container.scrollTop = Math.max(0, Math.min(target, container.scrollHeight - container.clientHeight));
  }, []); // intentionally empty: fires once on mount. isCurrentWeek and nowMinutes are
  // read from the initial render closure — scroll targets the current time when
  // the view first opened, not on every tick.

  return (
    <div className="m365-calendar-week-view">
      {/* Day header row */}
      <div className="m365-week-column-headers">
        <div className="m365-week-gutter-spacer" />
        {weekDays.map((day) => {
          const isToday = day.toDateString() === now.toDateString();
          return (
            <div
              key={`header-${toDateOnly(day)}`}
              className={['m365-calendar-week-day', isToday ? 'today' : '']
                .filter(Boolean)
                .join(' ')}
              onClick={() => onDayClick(day)}
            >
              <div className="m365-calendar-week-day-header">
                <span className="m365-calendar-week-day-name">
                  {day.toLocaleDateString(undefined, { weekday: 'short' })}
                </span>
                <span
                  className={['m365-calendar-week-day-number', isToday ? 'today' : '']
                    .filter(Boolean)
                    .join(' ')}
                >
                  {day.getDate()}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* All-day events row */}
      <div className="m365-week-allday-row">
        <div className="m365-week-allday-gutter" />
        {weekDays.map((day) => {
          const cellDateStr = toDateOnly(day);
          const allDayEvents = eventsByDate.get(cellDateStr)?.allDay ?? [];
          return (
            <div key={`allday-${cellDateStr}`} className="m365-week-allday-cell">
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
          );
        })}
      </div>

      {/* Timeline area */}
      <div className="m365-week-timeline-area" ref={scrollRef}>
        {isCurrentWeek && (
          <div
            className="m365-now-line"
            style={{ top: `${nowMinutes * PX_PER_MIN}px` }}
          />
        )}
        <div
          className="m365-week-time-gutter"
          style={{ position: 'relative', height: `${HOURS_IN_DAY * 60 * PX_PER_MIN}px` }}
        >
          {Array.from({ length: HOURS_IN_DAY }, (_, hour) => (
            <span
              key={hour}
              className="m365-day-view-hour-label"
              style={{ position: 'absolute', top: `${hour * 60 * PX_PER_MIN}px` }}
            >
              {String(hour).padStart(2, '0')}:00
            </span>
          ))}
        </div>
        {weekDays.map((day) => {
          const cellDateStr = toDateOnly(day);
          const timedEvents = eventsByDate.get(cellDateStr)?.timed ?? [];
          return (
            <TimelineColumn
              key={`timeline-${cellDateStr}`}
              date={day}
              events={timedEvents}
              calendars={calendars}
              onTimeClick={onDayClick}
              onEventClick={onEventClick}
              data-testid={`m365-week-timeline-${cellDateStr}`}
            />
          );
        })}
      </div>
    </div>
  );
};
