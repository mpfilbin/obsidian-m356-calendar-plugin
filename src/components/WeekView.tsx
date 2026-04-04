import React from 'react';
import { M365Event, M365Calendar } from '../types';
import { EventCard } from './EventCard';

interface WeekViewProps {
  currentDate: Date;
  events: M365Event[];
  calendars: M365Calendar[];
  onDayClick: (date: Date) => void;
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
}) => {
  const weekDays = getWeekDays(currentDate);
  const calendarMap = new Map(calendars.map((c) => [c.id, c]));
  const today = new Date();

  return (
    <div className="m365-calendar-week-view">
      {weekDays.map((day) => {
        const isToday = day.toDateString() === today.toDateString();
        const cellDateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
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
                return <EventCard key={event.id} event={event} calendar={cal} />;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
