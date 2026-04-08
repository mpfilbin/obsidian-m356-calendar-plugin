import React from 'react';
import { M365Event, M365Calendar } from '../types';
import { EventCard } from './EventCard';
import { toDateOnly } from '../lib/datetime';

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
  const calendarMap = new Map(calendars.map((c) => [c.id, c]));
  const today = new Date();

  return (
    <div className="m365-calendar-week-view">
      {weekDays.map((day) => {
        const isToday = day.toDateString() === today.toDateString();
        const cellDateStr = toDateOnly(day);
        const dayEvents = events
          .filter((e) => e.start.dateTime.slice(0, 10) === cellDateStr)
          .sort(
            (a, b) =>
              new Date(a.start.dateTime).getTime() -
              new Date(b.start.dateTime).getTime(),
          );

        return (
          <div
            key={`${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`}
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
                className={[
                  'm365-calendar-week-day-number',
                  isToday ? 'today' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {day.getDate()}
              </span>
            </div>
            <div className="m365-calendar-week-day-events">
              {dayEvents.map((event) => {
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
          </div>
        );
      })}
    </div>
  );
};
